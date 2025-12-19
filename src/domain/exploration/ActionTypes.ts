/**
 * Domain types for exploration actions.
 *
 * These types are moved from application/ports/LLMPort to domain
 * to fix DDD violation - domain should not depend on application layer.
 */

/**
 * Type of action the agent can take.
 */
export type ActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'hover'
  | 'scroll'
  | 'back'
  | 'refresh'
  | 'tool'
  | 'done';

/**
 * An action decision made by the LLM.
 */
export interface ActionDecision {
  /** Type of action to perform */
  action: ActionType;
  /** Mental scratchpad for reasoning process */
  thought_process?: string;
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
