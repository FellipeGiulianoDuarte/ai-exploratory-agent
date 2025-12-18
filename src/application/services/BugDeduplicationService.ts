/**
 * Bug Deduplication Service
 * 
 * Provides intelligent duplicate detection for bug findings.
 * Uses multiple strategies:
 * 1. Normalized key matching (e.g., all "Contakt" typos become one bug)
 * 2. Semantic similarity detection (similar descriptions)
 * 3. Location-based grouping (same bug on same element)
 */

export interface BugSignature {
  key: string;           // Normalized key for exact matching
  type: BugType;         // Bug category
  element?: string;      // Target element (selector or description)
  pagePattern: string;   // URL pattern (path without params)
  keywords: string[];    // Key words for semantic matching
}

export type BugType = 
  | 'typo'
  | 'undefined_value'
  | 'dropdown_error'
  | 'console_error'
  | 'broken_image'
  | 'validation_error'
  | 'functional_bug'
  | 'ui_issue'
  | 'other';

export interface ReportedBug {
  id: string;
  signature: BugSignature;
  title: string;
  description: string;
  stepsToReproduce: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  pageUrl: string;
  reportedAt: Date;
}

/**
 * Bug patterns for common issues
 */
const BUG_PATTERNS: Array<{
  pattern: RegExp;
  type: BugType;
  keyExtractor: (match: RegExpMatchArray, text: string) => string;
}> = [
  // Typo patterns - extract the misspelled word
  {
    pattern: /typo[:\s]*['"]?(\w+)['"]?\s*(should\s*be|instead\s*of|→|->)\s*['"]?(\w+)['"]?/i,
    type: 'typo',
    keyExtractor: (match) => `typo:${match[1].toLowerCase()}:${match[3].toLowerCase()}`,
  },
  {
    pattern: /['"]?(\w+)['"]?\s*(misspelled|misspelt|typo)\s*(as|should be)?\s*['"]?(\w+)['"]?/i,
    type: 'typo',
    keyExtractor: (match) => `typo:${match[1].toLowerCase()}:${match[4]?.toLowerCase() || 'unknown'}`,
  },
  {
    pattern: /contakt/i,
    type: 'typo',
    keyExtractor: () => 'typo:contakt:contact',
  },
  
  // Undefined/null values
  {
    pattern: /(undefined|null|nan|\[object\s*object\])/i,
    type: 'undefined_value',
    keyExtractor: (matchResult, text) => {
      // Try to extract context (what shows undefined)
      const context = text.toLowerCase().includes('dropdown') ? 'dropdown' : 
                     text.toLowerCase().includes('select') ? 'dropdown' : 
                     text.toLowerCase().includes('option') ? 'dropdown' : 'text';
      return `undefined:${context}:${matchResult[1].toLowerCase()}`;
    },
  },
  
  // Dropdown errors
  {
    pattern: /dropdown\s*(shows?|contains?|has|displays?)\s*['"]?(error|invalid|undefined|null)/i,
    type: 'dropdown_error',
    keyExtractor: (_match, text) => {
      // Extract error code if present
      const errorCodeMatch = text.match(/error\s*(\d+)/i);
      const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'generic';
      return `dropdown_error:${errorCode}`;
    },
  },
  {
    pattern: /error\s*(\d+)[:]*\s*([^'"]+)/i,
    type: 'dropdown_error',
    keyExtractor: (match) => `error_message:${match[1]}`,
  },
  
  // Console errors
  {
    pattern: /console\s*(error|warning)/i,
    type: 'console_error',
    keyExtractor: (_, text) => {
      // Try to extract the actual error message
      const errorMatch = text.match(/:\s*(.+?)(?:\.|$)/);
      const errorKey = errorMatch ? errorMatch[1].substring(0, 50) : 'generic';
      return `console:${errorKey.toLowerCase().replace(/\s+/g, '_')}`;
    },
  },
  
  // Broken images
  {
    pattern: /broken\s*image|image\s*(broken|missing|failed|not\s*load)/i,
    type: 'broken_image',
    keyExtractor: (_, text) => {
      // Try to extract image identifier
      const srcMatch = text.match(/src[=:]\s*['"]?([^'">\s]+)/i);
      if (srcMatch) {
        const src = srcMatch[1].split('/').pop() || 'unknown';
        return `broken_image:${src}`;
      }
      return 'broken_image:generic';
    },
  },
  
  // Validation errors
  {
    pattern: /validation\s*(error|missing|fail)|form\s*(validation|error)/i,
    type: 'validation_error',
    keyExtractor: (_, text) => {
      const fieldMatch = text.match(/(email|password|name|phone|address|field)\s*(validation|error)?/i);
      const field = fieldMatch ? fieldMatch[1].toLowerCase() : 'generic';
      return `validation:${field}`;
    },
  },
];

/**
 * Configuration for bug deduplication.
 */
export interface BugDeduplicationConfig {
  /** Semantic similarity threshold (0-1) */
  similarityThreshold?: number;
  /** Enable pattern matching for deduplication */
  enablePatternMatching?: boolean;
  /** Enable semantic matching for deduplication */
  enableSemanticMatching?: boolean;
}

export class BugDeduplicationService {
  private reportedBugs: Map<string, ReportedBug> = new Map();
  private keyToId: Map<string, string> = new Map();
  private config: Required<BugDeduplicationConfig>;

  constructor(config: BugDeduplicationConfig = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.6,
      enablePatternMatching: config.enablePatternMatching ?? true,
      enableSemanticMatching: config.enableSemanticMatching ?? true,
    };
  }

  /**
   * Check if a bug description represents a duplicate of an already-reported bug.
   * Returns the existing bug ID if duplicate, null if new.
   */
  isDuplicate(description: string, pageUrl: string): string | null {
    const signature = this.extractSignature(description, pageUrl);
    
    // Check exact key match
    const existingId = this.keyToId.get(signature.key);
    if (existingId) {
      return existingId;
    }
    
    // Check semantic similarity with existing bugs of same type
    for (const [id, bug] of this.reportedBugs) {
      if (bug.signature.type === signature.type) {
        if (this.isSemanticallySimlar(signature, bug.signature)) {
          return id;
        }
      }
    }
    
    return null;
  }

  /**
   * Register a new bug to track for deduplication.
   */
  registerBug(
    id: string,
    title: string,
    description: string,
    severity: ReportedBug['severity'],
    pageUrl: string,
    stepsToReproduce: string[] = []
  ): void {
    const signature = this.extractSignature(description, pageUrl);
    
    const bug: ReportedBug = {
      id,
      signature,
      title,
      description,
      stepsToReproduce,
      severity,
      pageUrl,
      reportedAt: new Date(),
    };
    
    this.reportedBugs.set(id, bug);
    this.keyToId.set(signature.key, id);
  }

  /**
   * Get all reported bugs.
   */
  getReportedBugs(): ReportedBug[] {
    return Array.from(this.reportedBugs.values());
  }

  /**
   * Clear all tracked bugs (for new session).
   */
  clear(): void {
    this.reportedBugs.clear();
    this.keyToId.clear();
  }

  /**
   * Get bug count by type.
   */
  getBugCountByType(): Map<BugType, number> {
    const counts = new Map<BugType, number>();
    for (const bug of this.reportedBugs.values()) {
      const current = counts.get(bug.signature.type) || 0;
      counts.set(bug.signature.type, current + 1);
    }
    return counts;
  }

  /**
   * Extract a signature from bug description.
   */
  private extractSignature(description: string, pageUrl: string): BugSignature {
    const lowerDesc = description.toLowerCase();
    
    // Try to match against known patterns
    for (const { pattern, type, keyExtractor } of BUG_PATTERNS) {
      const match = description.match(pattern);
      if (match) {
        return {
          key: keyExtractor(match, description),
          type,
          pagePattern: this.extractPagePattern(pageUrl),
          keywords: this.extractKeywords(description),
        };
      }
    }
    
    // Fallback: create a generic signature
    return {
      key: this.createGenericKey(description),
      type: this.inferBugType(lowerDesc),
      pagePattern: this.extractPagePattern(pageUrl),
      keywords: this.extractKeywords(description),
    };
  }

  /**
   * Check if two signatures are semantically similar.
   */
  private isSemanticallySimlar(sig1: BugSignature, sig2: BugSignature): boolean {
    // Must be same bug type
    if (sig1.type !== sig2.type) {
      return false;
    }
    
    // Check keyword overlap (Jaccard similarity)
    const set2 = new Set(sig2.keywords);
    const intersection = sig1.keywords.filter(k => set2.has(k));
    const union = new Set([...sig1.keywords, ...sig2.keywords]);
    
    const similarity = intersection.length / union.size;
    
    // Threshold: configured via SIMILARITY_THRESHOLD
    return similarity >= this.config.similarityThreshold;
  }

  /**
   * Extract URL pattern (path without query params or IDs).
   */
  private extractPagePattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query params and common ID patterns
      let path = parsed.pathname
        .replace(/\/\d+/g, '/:id')
        .replace(/\/[a-f0-9-]{36}/g, '/:uuid');
      
      // Include hash for SPA routes
      if (parsed.hash && parsed.hash.startsWith('#/')) {
        path += parsed.hash.replace(/\/\d+/g, '/:id');
      }
      
      return path;
    } catch {
      return url;
    }
  }

  /**
   * Extract significant keywords from description.
   */
  private extractKeywords(description: string): string[] {
    // Remove common stop words and extract significant terms
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and',
      'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not',
      'only', 'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any', 'this',
      'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
      'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it',
      'its', 'they', 'them', 'their', 'theirs', 'what', 'which', 'who', 'whom',
      'shows', 'showing', 'found', 'see', 'page', 'instead', 'should', 'issue',
      'bug', 'error', 'problem', 'appears', 'display', 'displayed',
    ]);
    
    return description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Max 10 keywords
  }

  /**
   * Create a generic key from description (for fallback).
   */
  private createGenericKey(description: string): string {
    const keywords = this.extractKeywords(description);
    return `generic:${keywords.slice(0, 5).join('_')}`;
  }

  /**
   * Infer bug type from description (for fallback).
   */
  private inferBugType(lowerDesc: string): BugType {
    if (lowerDesc.includes('typo') || lowerDesc.includes('misspell') || lowerDesc.includes('spelling')) {
      return 'typo';
    }
    if (lowerDesc.includes('undefined') || lowerDesc.includes('null') || lowerDesc.includes('nan')) {
      return 'undefined_value';
    }
    if (lowerDesc.includes('dropdown') || lowerDesc.includes('select') || lowerDesc.includes('option')) {
      return 'dropdown_error';
    }
    if (lowerDesc.includes('console') || lowerDesc.includes('javascript')) {
      return 'console_error';
    }
    if (lowerDesc.includes('image') || lowerDesc.includes('img') || lowerDesc.includes('broken')) {
      return 'broken_image';
    }
    if (lowerDesc.includes('validation') || lowerDesc.includes('form') || lowerDesc.includes('field')) {
      return 'validation_error';
    }
    if (lowerDesc.includes('button') || lowerDesc.includes('click') || lowerDesc.includes('submit') || 
        lowerDesc.includes('not working') || lowerDesc.includes('fail')) {
      return 'functional_bug';
    }
    if (lowerDesc.includes('layout') || lowerDesc.includes('display') || lowerDesc.includes('ui') ||
        lowerDesc.includes('visual') || lowerDesc.includes('style')) {
      return 'ui_issue';
    }
    return 'other';
  }

  /**
   * Get a summary of reported bugs for LLM context.
   */
  getReportedBugsSummary(): string {
    if (this.reportedBugs.size === 0) {
      return 'No bugs reported yet.';
    }
    
    const bugsByType = this.getBugCountByType();
    const lines: string[] = ['Already reported bugs (DO NOT report again):'];
    
    for (const bug of this.reportedBugs.values()) {
      lines.push(`- [${bug.signature.type}] ${bug.title}`);
    }
    
    lines.push('');
    lines.push('Summary by type:');
    for (const [type, count] of bugsByType) {
      lines.push(`- ${type}: ${count}`);
    }
    
    return lines.join('\n');
  }
}
