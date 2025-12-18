/**
 * Navigation Planner
 * 
 * Creates exploration plans from discovered URLs,
 * determines logical ordering based on workflows,
 * and suggests the next URL to visit.
 */

import { DiscoveredURL, URLCategory, URLDiscoveryService } from './URLDiscoveryService';

export interface ExplorationPhase {
  name: string;
  description: string;
  urls: DiscoveredURL[];
  prerequisites: string[];
  category: URLCategory | 'mixed';
}

export interface ExplorationPlan {
  phases: ExplorationPhase[];
  totalUrls: number;
  estimatedSteps: number;
  summary: string;
}

export interface NavigationSuggestion {
  url: DiscoveredURL;
  reason: string;
  prerequisitesMet: boolean;
}

// Workflow dependencies - pages that should be visited after others
// TODO: Use these for smarter prerequisite checking
/*
const WORKFLOW_DEPENDENCIES: Record<string, string[]> = {
  // User pages require authentication
  '/profile': ['/login', '/signin', '/auth/login', '/register', '/signup'],
  '/settings': ['/login', '/signin', '/auth/login'],
  '/dashboard': ['/login', '/signin', '/auth/login'],
  '/account': ['/login', '/signin', '/auth/login'],
  '/my-orders': ['/login', '/signin', '/auth/login'],
  '/order-history': ['/login', '/signin', '/auth/login'],
  
  // Checkout requires cart
  '/checkout': ['/cart'],
  '/payment': ['/cart', '/checkout'],
  
  // Login should come after register
  '/login': ['/register', '/signup'],
  '/signin': ['/register', '/signup'],
  '/auth/login': ['/auth/register', '/register', '/signup'],
};

// Category priority for exploration order
const CATEGORY_PRIORITY: URLCategory[] = [
  'auth',      // Register/Login first
  'product',   // Main features
  'cart',      // Shopping flow
  'user',      // User-specific (after auth)
  'admin',     // Admin (if accessible)
  'info',      // Informational last
  'other',     // Everything else
];
*/

export class NavigationPlanner {
  private urlDiscovery: URLDiscoveryService;
  private isAuthenticated: boolean = false;
  private hasItemsInCart: boolean = false;

  constructor(urlDiscovery: URLDiscoveryService) {
    this.urlDiscovery = urlDiscovery;
  }

  /**
   * Set authentication state
   */
  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
  }

  /**
   * Set cart state
   */
  setHasItemsInCart(hasItems: boolean): void {
    this.hasItemsInCart = hasItems;
  }

  /**
   * Create an exploration plan from discovered URLs
   */
  createPlan(): ExplorationPlan {
    const siteMap = this.urlDiscovery.getSiteMap();
    const phases: ExplorationPhase[] = [];

    // Phase 1: Authentication (if auth URLs exist)
    const authUrls = siteMap.urlsByCategory.auth;
    if (authUrls.length > 0) {
      // Order: register first, then login
      const registerUrls = authUrls.filter(u => 
        /register|signup|sign-up/i.test(u.normalizedUrl)
      );
      const loginUrls = authUrls.filter(u => 
        /login|signin|sign-in/i.test(u.normalizedUrl) &&
        !/register|signup/i.test(u.normalizedUrl)
      );
      const otherAuthUrls = authUrls.filter(u => 
        !registerUrls.includes(u) && !loginUrls.includes(u)
      );

      if (registerUrls.length > 0 || loginUrls.length > 0) {
        phases.push({
          name: 'Authentication Setup',
          description: 'Create account and establish authenticated session',
          urls: [...registerUrls, ...loginUrls, ...otherAuthUrls],
          prerequisites: [],
          category: 'auth',
        });
      }
    }

    // Phase 2: Core Features (products, categories)
    const productUrls = siteMap.urlsByCategory.product;
    if (productUrls.length > 0) {
      phases.push({
        name: 'Core Features',
        description: 'Test main product browsing and features',
        urls: productUrls,
        prerequisites: [],
        category: 'product',
      });
    }

    // Phase 3: Shopping Flow (cart, checkout)
    const cartUrls = siteMap.urlsByCategory.cart;
    if (cartUrls.length > 0) {
      // Order cart before checkout
      const cartOnly = cartUrls.filter(u => /cart|basket/i.test(u.normalizedUrl));
      const checkoutUrls = cartUrls.filter(u => /checkout|payment|order/i.test(u.normalizedUrl));
      
      phases.push({
        name: 'Shopping Flow',
        description: 'Test cart and checkout process',
        urls: [...cartOnly, ...checkoutUrls],
        prerequisites: ['Add items to cart'],
        category: 'cart',
      });
    }

    // Phase 4: User Features (requires auth)
    const userUrls = siteMap.urlsByCategory.user;
    if (userUrls.length > 0) {
      phases.push({
        name: 'User Features',
        description: 'Test authenticated user features',
        urls: userUrls,
        prerequisites: ['Authentication'],
        category: 'user',
      });
    }

    // Phase 5: Admin (if accessible)
    const adminUrls = siteMap.urlsByCategory.admin;
    if (adminUrls.length > 0) {
      phases.push({
        name: 'Admin Features',
        description: 'Test administrative functionality',
        urls: adminUrls,
        prerequisites: ['Admin authentication'],
        category: 'admin',
      });
    }

    // Phase 6: Informational Pages
    const infoUrls = siteMap.urlsByCategory.info;
    if (infoUrls.length > 0) {
      phases.push({
        name: 'Informational Pages',
        description: 'Verify static content pages',
        urls: infoUrls,
        prerequisites: [],
        category: 'info',
      });
    }

    // Phase 7: Other URLs
    const otherUrls = siteMap.urlsByCategory.other;
    if (otherUrls.length > 0) {
      phases.push({
        name: 'Other Pages',
        description: 'Explore remaining discovered pages',
        urls: otherUrls,
        prerequisites: [],
        category: 'other',
      });
    }

    const totalUrls = phases.reduce((sum, p) => sum + p.urls.length, 0);

    return {
      phases,
      totalUrls,
      estimatedSteps: Math.ceil(totalUrls * 1.5), // Estimate ~1.5 steps per URL
      summary: this.generatePlanSummary(phases, totalUrls),
    };
  }

  /**
   * Generate a readable summary of the plan
   */
  private generatePlanSummary(phases: ExplorationPhase[], totalUrls: number): string {
    const lines: string[] = [
      `📋 Exploration Plan`,
      `   Total URLs to visit: ${totalUrls}`,
      `   Phases: ${phases.length}`,
      '',
    ];

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const unvisited = phase.urls.filter(u => !u.visited).length;
      lines.push(`   ${i + 1}. ${phase.name} (${unvisited}/${phase.urls.length} remaining)`);
      
      // Show first 3 URLs
      const urlsToShow = phase.urls.slice(0, 3);
      for (const url of urlsToShow) {
        const status = url.visited ? '✓' : '○';
        const path = new URL(url.normalizedUrl).pathname;
        lines.push(`      ${status} ${path}`);
      }
      if (phase.urls.length > 3) {
        lines.push(`      ... and ${phase.urls.length - 3} more`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get the next suggested URL to visit
   */
  getNextSuggestion(currentUrl: string): NavigationSuggestion | null {
    const unvisited = this.urlDiscovery.getUnvisitedURLs();
    if (unvisited.length === 0) {
      return null;
    }

    // Get plan to understand phase ordering
    const plan = this.createPlan();

    // Find the first phase with unvisited URLs
    for (const phase of plan.phases) {
      const unvisitedInPhase = phase.urls.filter(u => !u.visited);
      if (unvisitedInPhase.length === 0) continue;

      // Check prerequisites
      const prerequisitesMet = this.checkPrerequisites(phase, currentUrl);

      // Find the best URL in this phase
      const nextUrl = this.selectBestUrl(unvisitedInPhase, currentUrl);
      if (nextUrl) {
        return {
          url: nextUrl,
          reason: this.getNavigationReason(nextUrl, phase, prerequisitesMet),
          prerequisitesMet,
        };
      }
    }

    // Fallback: return first unvisited URL
    const fallback = unvisited[0];
    return {
      url: fallback,
      reason: `Exploring unvisited page: ${fallback.linkText || new URL(fallback.normalizedUrl).pathname}`,
      prerequisitesMet: true,
    };
  }

  /**
   * Check if phase prerequisites are met
   */
  private checkPrerequisites(phase: ExplorationPhase, _currentUrl: string): boolean {
    // User features require authentication
    if (phase.category === 'user' && !this.isAuthenticated) {
      return false;
    }

    // Cart/checkout requires items in cart
    if (phase.category === 'cart') {
      const isCheckout = phase.urls.some(u => /checkout|payment/i.test(u.normalizedUrl));
      if (isCheckout && !this.hasItemsInCart) {
        return false;
      }
    }

    // Admin requires admin auth (assume not met unless proven)
    if (phase.category === 'admin') {
      return false; // Conservative - assume admin not accessible
    }

    return true;
  }

  /**
   * Select the best URL to visit from a list based on priority score
   */
  private selectBestUrl(urls: DiscoveredURL[], _currentUrl: string): DiscoveredURL | null {
    if (urls.length === 0) return null;

    // Sort by priority score (lower score = higher priority)
    const sorted = [...urls].sort((a, b) => {
      // Primary sort: by priority score
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore;
      }
      // Secondary sort: by discovery time (earlier = higher priority)
      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });

    return sorted[0];
  }

  /**
   * Generate reason for navigation suggestion
   */
  private getNavigationReason(url: DiscoveredURL, phase: ExplorationPhase, prerequisitesMet: boolean): string {
    const path = new URL(url.normalizedUrl).pathname;
    
    if (!prerequisitesMet) {
      return `[Blocked] ${phase.name}: ${path} - Prerequisites not met (${phase.prerequisites.join(', ')})`;
    }

    switch (phase.category) {
      case 'auth':
        if (/register|signup/i.test(url.normalizedUrl)) {
          return `Create account at ${path} before testing authenticated features`;
        }
        if (/login|signin/i.test(url.normalizedUrl)) {
          return `Login at ${path} to access user features`;
        }
        return `Authentication page: ${path}`;

      case 'product':
        return `Explore product features at ${path}`;

      case 'cart':
        if (/checkout|payment/i.test(url.normalizedUrl)) {
          return `Test checkout flow at ${path}`;
        }
        return `Test cart functionality at ${path}`;

      case 'user':
        return `Test user feature at ${path} (requires login)`;

      case 'info':
        return `Verify informational page: ${path}`;

      default:
        return `Explore: ${path}`;
    }
  }

  /**
   * Get a concise plan summary for LLM context
   */
  getPlanContextForLLM(): string {
    const unvisited = this.urlDiscovery.getUnvisitedURLs();
    const suggestion = this.getNextSuggestion('');
    
    if (unvisited.length === 0) {
      return 'All discovered URLs have been visited.';
    }

    const lines: string[] = [
      `## URL Discovery Queue (${unvisited.length} unvisited)`,
      '',
    ];

    // Group by category
    const byCategory: Record<string, DiscoveredURL[]> = {};
    for (const url of unvisited) {
      if (!byCategory[url.category]) {
        byCategory[url.category] = [];
      }
      byCategory[url.category].push(url);
    }

    // Show categorized URLs
    for (const [category, urls] of Object.entries(byCategory)) {
      if (urls.length > 0) {
        lines.push(`**${category.toUpperCase()}:** (${urls.length})`);
        for (const url of urls.slice(0, 3)) {
          const path = new URL(url.normalizedUrl).pathname;
          lines.push(`- ${path} - "${url.linkText.substring(0, 30)}"`);
        }
        if (urls.length > 3) {
          lines.push(`- ... and ${urls.length - 3} more`);
        }
        lines.push('');
      }
    }

    // Add suggestion
    if (suggestion) {
      lines.push(`**Suggested Next:** ${new URL(suggestion.url.normalizedUrl).pathname}`);
      lines.push(`**Reason:** ${suggestion.reason}`);
    }

    return lines.join('\n');
  }
}
