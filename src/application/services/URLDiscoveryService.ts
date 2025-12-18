/**
 * URL Discovery Service
 * 
 * Scans pages for discoverable URLs from <a href> elements,
 * normalizes them, categorizes them, and maintains a queue
 * of URLs to visit.
 */

import { BrowserPort } from '../ports/BrowserPort';

export type URLCategory = 
  | 'auth' 
  | 'user' 
  | 'product' 
  | 'cart' 
  | 'admin' 
  | 'info' 
  | 'other';

export interface DiscoveredURL {
  url: string;
  normalizedUrl: string;
  category: URLCategory;
  linkText: string;
  foundOnPage: string;
  priority: 'high' | 'medium' | 'low';
  priorityScore: number; // Lower score = higher priority (0-100)
  visited: boolean;
  discoveredAt: Date;
}

export interface URLDiscoveryConfig {
  /** Only discover same-origin URLs */
  sameOriginOnly: boolean;
  /** URL patterns to exclude (glob-like) */
  excludePatterns: string[];
  /** URL patterns to prioritize */
  priorityPatterns: string[];
  /** Maximum URLs to queue */
  maxQueueSize: number;
}

export interface SiteMap {
  baseUrl: string;
  discoveredUrls: DiscoveredURL[];
  visitedUrls: string[];
  urlsByCategory: Record<URLCategory, DiscoveredURL[]>;
  totalDiscovered: number;
  totalVisited: number;
}

// URL category patterns
const CATEGORY_PATTERNS: Record<URLCategory, RegExp[]> = {
  auth: [
    /\/(auth|login|signin|sign-in|logout|signout|sign-out|register|signup|sign-up|forgot|reset|password)/i,
  ],
  user: [
    /\/(profile|account|settings|dashboard|my-|user|preferences)/i,
  ],
  product: [
    /\/(product|item|category|categories|catalog|shop|store|browse)/i,
  ],
  cart: [
    /\/(cart|basket|checkout|payment|order)/i,
  ],
  admin: [
    /\/(admin|manage|management|cms|backend|control)/i,
  ],
  info: [
    /\/(about|contact|faq|help|support|terms|privacy|policy|blog|news)/i,
  ],
  other: [],
};

// Priority Score System (lower score = higher priority)
// 0-10: Signup pages (highest priority)
// 11-20: Login pages
// 21-30: Home page
// 31-40: Core features (products, cart)
// 41-60: Other medium priority pages
// 61-70: Contact page
// 71-80: About and other info pages
// 81-90: Low priority pages (terms, privacy, etc.)
// 91-100: Very low priority (blog, news, etc.)

const SIGNUP_PATTERNS = [
  /\/(register|signup|sign-up)/i,
];

const LOGIN_PATTERNS = [
  /\/(login|signin|sign-in)/i,
];

const HOME_PATTERNS = [
  /^https?:\/\/[^\/]+\/?$/i,        // Matches root URL (with or without trailing slash)
  /^https?:\/\/[^\/]+\/#\/?$/i,     // Matches SPA root routes: https://example.com/#/ or https://example.com/#
];

const CONTACT_PATTERNS = [
  /\/contact/i,
];

const ABOUT_PATTERNS = [
  /\/about/i,
];

const INFO_LOW_PRIORITY_PATTERNS = [
  /\/(faq|help|support)/i,
];

const VERY_LOW_PRIORITY_PATTERNS = [
  /\/(terms|privacy|policy|legal)/i,
  /\/(blog|news|press)/i,
];

// Default exclusion patterns
const DEFAULT_EXCLUDE_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^javascript:/i,
  /^#$/,
  /\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot)$/i,
  /\/(logout|signout|sign-out)/i,
  /\/api\//i,
  /\/_next\//i,
  /\/static\//i,
];

export class URLDiscoveryService {
  private discoveredUrls: Map<string, DiscoveredURL> = new Map();
  private visitedUrls: Set<string> = new Set();
  private baseUrl: string = '';
  private config: URLDiscoveryConfig;

  constructor(config: Partial<URLDiscoveryConfig> = {}) {
    this.config = {
      sameOriginOnly: true,
      excludePatterns: [],
      priorityPatterns: [],
      maxQueueSize: 100,
      ...config,
    };
  }

  /**
   * Set the base URL for the exploration
   */
  setBaseUrl(url: string): void {
    try {
      const parsed = new URL(url);
      this.baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      this.baseUrl = url;
    }
  }

  /**
   * Scan page for discoverable URLs using BrowserPort
   * @param browser BrowserPort interface
   * @param currentUrl Current page URL
   */
  async scanPage(browser: BrowserPort, currentUrl: string): Promise<DiscoveredURL[]> {
    // Set base URL from first scan
    if (!this.baseUrl) {
      this.setBaseUrl(currentUrl);
    }

    // Mark current URL as visited
    this.markVisited(currentUrl);

    // Extract all links from page using evaluate
    const links = await browser.evaluate<Array<{href: string; text: string}>>(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors).map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLAnchorElement).textContent?.trim() || '',
      }));
    });

    const newlyDiscovered: DiscoveredURL[] = [];

    for (const link of links) {
      const discovered = this.processLink(link.href, link.text, currentUrl);
      if (discovered) {
        newlyDiscovered.push(discovered);
      }
    }

    return newlyDiscovered;
  }

  /**
   * Process a single link and add to queue if valid
   */
  private processLink(href: string, linkText: string, foundOnPage: string): DiscoveredURL | null {
    // Normalize the URL
    const normalizedUrl = this.normalizeUrl(href);
    if (!normalizedUrl) {
      return null;
    }

    // Check if already discovered
    if (this.discoveredUrls.has(normalizedUrl)) {
      return null;
    }

    // Check exclusion patterns
    if (this.shouldExclude(normalizedUrl)) {
      return null;
    }

    // Check same-origin
    if (this.config.sameOriginOnly && !this.isSameOrigin(normalizedUrl)) {
      return null;
    }

    // Check queue size
    if (this.discoveredUrls.size >= this.config.maxQueueSize) {
      return null;
    }

    // Get priority information
    const priorityInfo = this.getPriority(normalizedUrl);

    // Create discovered URL entry
    const discovered: DiscoveredURL = {
      url: href,
      normalizedUrl,
      category: this.categorizeUrl(normalizedUrl),
      linkText: linkText.substring(0, 100), // Truncate long text
      foundOnPage,
      priority: priorityInfo.priority,
      priorityScore: priorityInfo.score,
      visited: false,
      discoveredAt: new Date(),
    };

    this.discoveredUrls.set(normalizedUrl, discovered);
    return discovered;
  }

  /**
   * Normalize a URL for comparison.
   * Preserves hash fragments for SPA routes (e.g., /#/contact)
   */
  private normalizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url, this.baseUrl);
      
      // For SPA hash routing (e.g., /#/products, #/contact),
      // preserve the hash as it represents the actual route
      // Only remove simple anchors like #top, #section-1, etc.
      const hash = parsed.hash;
      const isSpaRoute = hash.startsWith('#/') || hash.startsWith('#!/');
      
      if (!isSpaRoute) {
        // Remove simple anchor fragments
        parsed.hash = '';
      }
      
      // Remove trailing slash (but not for root)
      let normalized = parsed.href;
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      
      // For SPA routes, also normalize trailing slash after hash
      if (isSpaRoute && normalized.endsWith('/') && !normalized.endsWith('#/')) {
        normalized = normalized.slice(0, -1);
      }
      
      return normalized;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL should be excluded
   */
  private shouldExclude(url: string): boolean {
    // Check default exclusions
    for (const pattern of DEFAULT_EXCLUDE_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }

    // Check custom exclusions
    for (const pattern of this.config.excludePatterns) {
      if (url.includes(pattern) || new RegExp(pattern).test(url)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if URL is same origin
   */
  private isSameOrigin(url: string): boolean {
    try {
      const parsed = new URL(url);
      const base = new URL(this.baseUrl);
      return parsed.host === base.host;
    } catch {
      return false;
    }
  }

  /**
   * Categorize URL based on patterns
   */
  private categorizeUrl(url: string): URLCategory {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (category === 'other') continue;
      
      for (const pattern of patterns) {
        if (pattern.test(url)) {
          return category as URLCategory;
        }
      }
    }
    return 'other';
  }

  /**
   * Get priority for URL
   * Returns both the priority level and the numeric priority score
   */
  private getPriority(url: string): { priority: 'high' | 'medium' | 'low'; score: number } {
    // Priority 1: Signup pages (score: 5)
    for (const pattern of SIGNUP_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'high', score: 5 };
      }
    }

    // Priority 2: Login pages (score: 15)
    for (const pattern of LOGIN_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'high', score: 15 };
      }
    }

    // Priority 3: Home page (score: 25)
    for (const pattern of HOME_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'high', score: 25 };
      }
    }

    // Check custom priority patterns (score: 30)
    for (const pattern of this.config.priorityPatterns) {
      if (url.includes(pattern) || new RegExp(pattern).test(url)) {
        return { priority: 'high', score: 30 };
      }
    }

    // Priority 4: Core features - products (score: 35)
    if (/\/(product|item|category|categories|catalog|shop|store|browse)/i.test(url)) {
      return { priority: 'medium', score: 35 };
    }

    // Priority 5: Cart and checkout (score: 40)
    if (/\/(cart|basket|checkout|payment|order)/i.test(url)) {
      return { priority: 'medium', score: 40 };
    }

    // Priority 6: User features (score: 45)
    if (/\/(profile|account|settings|dashboard|my-|user|preferences)/i.test(url)) {
      return { priority: 'medium', score: 45 };
    }

    // Priority 7: Contact page (score: 65)
    for (const pattern of CONTACT_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'medium', score: 65 };
      }
    }

    // Priority 8: About page (score: 75)
    for (const pattern of ABOUT_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'low', score: 75 };
      }
    }

    // Priority 9: Other info pages (score: 80)
    for (const pattern of INFO_LOW_PRIORITY_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'low', score: 80 };
      }
    }

    // Priority 10: Very low priority (score: 85)
    for (const pattern of VERY_LOW_PRIORITY_PATTERNS) {
      if (pattern.test(url)) {
        return { priority: 'low', score: 85 };
      }
    }

    // Default: medium priority (score: 50)
    return { priority: 'medium', score: 50 };
  }

  /**
   * Mark a URL as visited
   */
  markVisited(url: string): void {
    const normalized = this.normalizeUrl(url);
    if (normalized) {
      this.visitedUrls.add(normalized);
      
      const discovered = this.discoveredUrls.get(normalized);
      if (discovered) {
        discovered.visited = true;
      }
    }
  }

  /**
   * Check if URL has been visited
   */
  isVisited(url: string): boolean {
    const normalized = this.normalizeUrl(url);
    return normalized ? this.visitedUrls.has(normalized) : false;
  }

  /**
   * Get all unvisited URLs, sorted by priority score (lower score = higher priority)
   */
  getUnvisitedURLs(): DiscoveredURL[] {
    const unvisited = Array.from(this.discoveredUrls.values())
      .filter(u => !u.visited && !this.visitedUrls.has(u.normalizedUrl));

    // Sort by priority score (ascending order: lower score = higher priority)
    return unvisited.sort((a, b) => {
      // Primary sort: by priority score
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore;
      }
      // Secondary sort: by discovery time (earlier = higher priority)
      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });
  }

  /**
   * Get URLs by category
   */
  getURLsByCategory(category: URLCategory): DiscoveredURL[] {
    return Array.from(this.discoveredUrls.values())
      .filter(u => u.category === category);
  }

  /**
   * Get site map summary
   */
  getSiteMap(): SiteMap {
    const urls = Array.from(this.discoveredUrls.values());
    
    const urlsByCategory: Record<URLCategory, DiscoveredURL[]> = {
      auth: [],
      user: [],
      product: [],
      cart: [],
      admin: [],
      info: [],
      other: [],
    };

    for (const url of urls) {
      urlsByCategory[url.category].push(url);
    }

    return {
      baseUrl: this.baseUrl,
      discoveredUrls: urls,
      visitedUrls: Array.from(this.visitedUrls),
      urlsByCategory,
      totalDiscovered: urls.length,
      totalVisited: this.visitedUrls.size,
    };
  }

  /**
   * Get queue summary for logging
   */
  getQueueSummary(): string {
    const unvisited = this.getUnvisitedURLs();
    const byPriority = {
      high: unvisited.filter(u => u.priority === 'high').length,
      medium: unvisited.filter(u => u.priority === 'medium').length,
      low: unvisited.filter(u => u.priority === 'low').length,
    };

    return `URL Queue: ${unvisited.length} unvisited (H:${byPriority.high} M:${byPriority.medium} L:${byPriority.low}) | Visited: ${this.visitedUrls.size}`;
  }

  /**
   * Clear all discovered URLs
   */
  clear(): void {
    this.discoveredUrls.clear();
    this.visitedUrls.clear();
    this.baseUrl = '';
  }
}
