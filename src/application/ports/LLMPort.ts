import { ToolDefinition } from '../../domain/tools/Tool';
import { PersonaAnalysis } from '../../domain/personas';

/**
 * Type of action the agent can take.
 */
export type ActionType = 'navigate' | 'click' | 'fill' | 'select' | 'hover' | 'scroll' | 'back' | 'refresh' | 'tool' | 'done';

/**
 * An action decision made by the LLM.
 */
export interface ActionDecision {
  /** Type of action to perform */
  action: ActionType;
  /** Target element selector (for click, fill, etc.) */
  selector?: string;
  /** Value to use (for fill, select, navigate) */
  value?: string;
  /** Tool name to invoke (for tool action) */
  toolName?: string;
  /** Tool parameters (for tool action) */
  toolParams?: Record<string, unknown>;
  /** Reasoning for why this action was chosen */
  reasoning: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Factors affecting confidence */
  confidenceFactors?: string[];
  /** Alternative actions considered */
  alternatives?: Array<{
    action: ActionType;
    selector?: string;
    reasoning: string;
  }>;
  /** Hypothesis being tested */
  hypothesis?: string;
  /** Expected outcome of this action */
  expectedOutcome?: string;
  /** Issues/bugs observed on the current page */
  observedIssues?: string[];
}

/**
 * Simplified page state for LLM context.
 */
export interface LLMPageContext {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Visible text content (truncated) */
  visibleText: string;
  /** Interactive elements summary */
  elements: Array<{
    selector: string;
    type: string;
    text: string;
    isVisible: boolean;
  }>;
  /** Console errors if any */
  consoleErrors: string[];
  /** Network errors if any */
  networkErrors: string[];
}

/**
 * History entry for exploration context.
 */
export interface ExplorationHistoryEntry {
  /** Step number */
  step: number;
  /** Action taken */
  action: ActionDecision;
  /** Whether action succeeded */
  success: boolean;
  /** Error if action failed */
  error?: string;
  /** URL after action */
  resultingUrl: string;
  /** Findings discovered */
  findings?: string[];
}

/**
 * Request to the LLM for deciding next action.
 */
export interface LLMDecisionRequest {
  /** Current page state */
  pageContext: LLMPageContext;
  /** Exploration history */
  history: ExplorationHistoryEntry[];
  /** Available tools */
  tools: ToolDefinition[];
  /** Exploration goal/objective */
  objective?: string;
  /** Areas already explored */
  exploredAreas?: string[];
  /** Current exploration phase */
  phase?: 'discovery' | 'deep_dive' | 'verification';
  /** Persona analysis with suggestions (optional) */
  personaAnalysis?: PersonaAnalysis[];
  /** URL discovery queue context (optional) */
  urlQueueContext?: string;
  /** Summary of already reported bugs to avoid duplicates (optional) */
  reportedBugsSummary?: string;
}

/**
 * Response from the LLM.
 */
export interface LLMResponse {
  /** The decision made */
  decision: ActionDecision;
  /** Raw response content */
  rawResponse: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Response latency in ms */
  latency: number;
}

/**
 * Options for LLM completion.
 */
export interface LLMCompletionOptions {
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Port interface for LLM interactions.
 */
export interface LLMPort {
  /**
   * Get the provider name.
   */
  readonly provider: string;

  /**
   * Get the model being used.
   */
  readonly model: string;

  /**
   * Request a decision for the next exploration action.
   */
  decideNextAction(
    request: LLMDecisionRequest,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse>;

  /**
   * Analyze a finding for severity and description.
   */
  analyzeFinding(
    finding: string,
    context: LLMPageContext
  ): Promise<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
  }>;

  /**
   * Generate a summary of exploration session.
   */
  generateSummary(
    history: ExplorationHistoryEntry[],
    findings: string[]
  ): Promise<string>;

  /**
   * Check if the LLM is available and configured.
   */
  isAvailable(): Promise<boolean>;
}
