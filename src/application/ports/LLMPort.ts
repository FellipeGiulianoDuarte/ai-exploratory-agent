import { ToolDefinition } from '../../domain/tools/Tool';
import { PersonaAnalysis } from '../../domain/personas';
import { PageContext } from '../../domain/exploration/PageContext';
// Re-export domain types for backward compatibility
export {
  ActionType,
  ActionDecision,
  ExplorationHistoryEntry,
} from '../../domain/exploration/ActionTypes';
export { PageContext } from '../../domain/exploration/PageContext';
import { ActionDecision, ExplorationHistoryEntry } from '../../domain/exploration/ActionTypes';

/**
 * LLMPageContext is an alias for PageContext from domain layer.
 * Kept for backward compatibility.
 */
export interface LLMPageContext extends PageContext {
  /** Map of element selectors to their interaction history descriptions */
  elementInteractions?: Map<string, string[]>;
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
  /** Summary of already reported bugs to avoid duplicates (optional) */
  reportedBugsSummary?: string;
  /** Warning to inject if loop or repetition is detected (optional) */
  repetitionWarning?: string;
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
  generateSummary(history: ExplorationHistoryEntry[], findings: string[]): Promise<string>;

  /**
   * Check if the LLM is available and configured.
   */
  isAvailable(): Promise<boolean>;
}
