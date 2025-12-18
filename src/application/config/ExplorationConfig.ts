/**
 * Exploration Constants and Configuration
 *
 * Centralizes all magic numbers and configuration defaults
 * for the exploration system.
 */

/**
 * Page content limits.
 */
export const PAGE_CONTENT = {
  /** Maximum visible text length for LLM context */
  MAX_VISIBLE_TEXT_LENGTH: 5000,
  /** Maximum number of interactive elements to include */
  MAX_INTERACTIVE_ELEMENTS: 50,
  /** Maximum link text length for display */
  MAX_LINK_TEXT_LENGTH: 40,
} as const;

/**
 * Navigation and timing defaults.
 */
export const NAVIGATION = {
  /** Default wait time after navigation in milliseconds */
  DEFAULT_WAIT_TIME: 2000,
  /** Default step timeout in milliseconds */
  DEFAULT_STEP_TIMEOUT: 30000,
  /** Default max URLs in discovery queue */
  DEFAULT_MAX_QUEUE_SIZE: 100,
} as const;

/**
 * Retry configuration.
 */
export const RETRY = {
  /** Default max retries for operations */
  DEFAULT_MAX_RETRIES: 3,
  /** Default initial delay for retry backoff in milliseconds */
  DEFAULT_INITIAL_DELAY: 1000,
  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Loop detection defaults.
 */
export const LOOP_DETECTION = {
  /** Default max action repetitions before forcing alternative */
  DEFAULT_MAX_ACTION_REPETITIONS: 2,
  /** Value length limit for action signature normalization */
  VALUE_SIGNATURE_LENGTH: 50,
} as const;

/**
 * Exit criteria defaults.
 */
export const EXIT_CRITERIA = {
  /** Default max actions per page before moving on */
  DEFAULT_MAX_ACTIONS_PER_PAGE: 8,
  /** Default max time per page in milliseconds */
  DEFAULT_MAX_TIME_PER_PAGE: 60000,
  /** Default minimum element interactions before exit */
  DEFAULT_MIN_ELEMENT_INTERACTIONS: 3,
  /** Default exit after finding N bugs */
  DEFAULT_EXIT_AFTER_BUGS_FOUND: 3,
  /** Minimum steps on URL before considering exit */
  MIN_STEPS_BEFORE_EXIT: 2,
} as const;

/**
 * Bug deduplication defaults.
 */
export const DEDUPLICATION = {
  /** Default similarity threshold for bug matching */
  DEFAULT_SIMILARITY_THRESHOLD: 0.6,
} as const;

/**
 * Persona configuration defaults.
 */
export const PERSONA = {
  /** Default max suggestions per persona */
  DEFAULT_MAX_SUGGESTIONS_PER_PERSONA: 5,
} as const;

/**
 * Exploration defaults.
 */
export const EXPLORATION = {
  /** Default max steps */
  DEFAULT_MAX_STEPS: 100,
  /** Default checkpoint interval */
  DEFAULT_CHECKPOINT_INTERVAL: 10,
  /** Default progress summary interval */
  DEFAULT_PROGRESS_SUMMARY_INTERVAL: 5,
  /** Default minimum confidence threshold */
  DEFAULT_MIN_CONFIDENCE_THRESHOLD: 0.5,
  /** Default exploration objective */
  DEFAULT_OBJECTIVE:
    'Explore the web application thoroughly, looking for bugs, broken images, console errors, and usability issues.',
} as const;

/**
 * Progress tracking.
 */
export const PROGRESS = {
  /** Max recent actions to track */
  MAX_RECENT_ACTIONS: 10,
  /** Top suggestions for page */
  TOP_SUGGESTIONS_COUNT: 5,
  /** Displayed suggestions count */
  DISPLAYED_SUGGESTIONS_COUNT: 3,
} as const;

/**
 * URL Discovery constants.
 */
export const URL_DISCOVERY = {
  /** Max URLs to display in logs */
  MAX_URLS_TO_LOG: 3,
  /** Max URLs to suggest to LLM */
  MAX_URLS_TO_SUGGEST: 5,
} as const;

/**
 * Circuit breaker defaults.
 */
export const CIRCUIT_BREAKER = {
  /** Default failure threshold before opening */
  DEFAULT_FAILURE_THRESHOLD: 5,
  /** Default reset timeout in milliseconds */
  DEFAULT_RESET_TIMEOUT: 60000,
  /** Default success threshold in half-open */
  DEFAULT_SUCCESS_THRESHOLD: 2,
} as const;

/**
 * Finding classification patterns.
 */
export const FINDING_PATTERNS = {
  /** Patterns indicating no bugs found (false positives) */
  NO_BUG_PATTERNS: [
    'no immediate bugs',
    'no bugs found',
    'no issues found',
    'no errors found',
    'no issues detected',
    'no bugs detected',
    'no issues on',
    'no bugs on',
    'no visible issues',
    'no apparent bugs',
    'no bugs observed',
    'no issues observed',
    'page looks good',
    'everything looks fine',
    'everything looks good',
    'looks correct',
    'appears correct',
    'working correctly',
    'works as expected',
    'functioning properly',
    'not yet tested',
    'none are visible',
    'but none are',
    'if any',
  ],
  /** Patterns indicating navigation descriptions */
  NAVIGATION_PATTERNS: [
    'navigating to',
    'navigating away',
    'navigate to',
    'navigation to',
    'page is focused',
    'currently on',
    'currently focused',
    'now on',
    'successfully loaded',
    'loaded successfully',
    'moving to',
    'going to',
    'proceeding to',
  ],
  /** Patterns indicating speculative statements */
  SPECULATIVE_PATTERNS: [
    'actual outcome requires',
    'requires submission',
    'requires server',
    'server response unknown',
    'outcome requires',
    'may affect',
    'might affect',
    'could affect',
    'may impact',
    'might impact',
    'could impact',
    'potential issue if',
    'would need to',
    'needs further',
    'requires further',
  ],
  /** Patterns indicating expected behavior */
  EXPECTED_BEHAVIOR_PATTERNS: [
    'accepts text',
    'accepts input',
    'accepts special characters',
    'field works',
    'input works',
    'button works',
    'link works',
    'as expected',
  ],
  /** Minimum words for actionable issue */
  MIN_ACTIONABLE_WORDS: 3,
  /** Minimum word length for counting */
  MIN_WORD_LENGTH: 3,
} as const;

/**
 * Severity classification keywords.
 */
export const SEVERITY_KEYWORDS = {
  /** Keywords indicating LOW severity */
  LOW: ['typo', 'misspell', 'spelling', 'contakt', 'should be'],
  /** Keywords indicating CRITICAL severity */
  CRITICAL: [
    'security',
    'injection',
    'xss',
    'unauthorized',
    'crash',
    'data loss',
    'password exposed',
    'credential',
  ],
  /** Keywords indicating HIGH severity */
  HIGH: [
    'undefined',
    'null',
    '[object object]',
    'nan',
    "doesn't work",
    'not working',
    'fails to',
    'cannot',
    'unable to',
    '500',
    'exception',
  ],
  /** Keywords indicating MEDIUM severity */
  MEDIUM: [
    'error',
    'console',
    'broken image',
    'image not',
    '404',
    'validation',
    'missing',
    'incorrect',
  ],
} as const;

/**
 * Issue type classification keywords.
 */
export const ISSUE_TYPE_KEYWORDS = {
  text_issue: ['typo', 'misspell', 'spelling'],
  console_error: ['console', 'javascript error'],
  broken_image: ['image', 'img'],
  security: ['security', 'xss', 'injection'],
  usability: ['usability', 'ux', 'confusing'],
  ui_issue: ['layout', 'display', 'ui'],
  network_error: ['network', '404', '500'],
} as const;

/**
 * Finding type prefixes.
 */
export const FINDING_TYPE_PREFIXES = {
  broken_image: 'Broken Image',
  console_error: 'Console Error',
  network_error: 'Network Error',
  accessibility: 'Accessibility Issue',
  usability: 'Usability Issue',
  functional: 'Functional Bug',
  performance: 'Performance Issue',
  security: 'Security Issue',
  observed_bug: 'Bug Found',
  text_issue: 'Text Issue',
  ui_issue: 'UI Issue',
  other: 'Issue',
} as const;

/**
 * URL category priority for navigation.
 */
export const URL_CATEGORY_PRIORITY = ['auth', 'product', 'cart', 'user', 'info', 'other'] as const;
