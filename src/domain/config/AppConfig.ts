/**
 * Domain Configuration Interfaces
 */

export interface ExplorationConfig {
  url: string;
  objective: string;
  maxSteps: number;
  checkpointInterval: number;
  exitAfterBugsFound: number;
  requiredTools: string[];
  checkpointOnToolFindings: boolean;
  progressSummaryInterval: number;
}

export interface NavigationConfig {
  waitTime: number;
  timeout: number;
  maxQueueSize: number;
  scrollAmount: number;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey: string;
  model?: string;
  minConfidence: number;
  temperature: number;
  fallbacks?: ('openai' | 'anthropic' | 'gemini')[];
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold?: number;
    resetTimeoutMs?: number;
    successThreshold?: number;
  };
}

export interface BrowserConfig {
  headless: boolean;
  width: number;
  height: number;
  screenshotDir: string;
}

export interface PageAnalysisConfig {
  maxVisibleText: number;
  maxInteractiveElements: number;
  maxLinkTextLength: number;
  minActionableWords: number;
  excludeSelectors: string[];
}

export interface PersonaConfig {
  enabled: boolean;
  maxSuggestions: number;
  enableSecurity: boolean;
  enableMonitor: boolean;
  enableValidation: boolean;
  enableChaos: boolean;
  enableEdgeCase: boolean;
}

export interface DeduplicationConfig {
  threshold: number;
  patternMatching: boolean;
  semanticMatching: boolean;
}

export interface LoopDetectionConfig {
  toolHistorySize: number;
  toolLoopThreshold: number;
  actionHistorySize: number;
  actionLoopThreshold: number;
}

export interface AppConfig {
  exploration: ExplorationConfig;
  navigation: NavigationConfig;
  llm: LLMConfig;
  browser: BrowserConfig;
  pageAnalysis: PageAnalysisConfig;
  personas: PersonaConfig;
  deduplication: DeduplicationConfig;
  loopDetection: LoopDetectionConfig;
}
