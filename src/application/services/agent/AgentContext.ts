import { ExplorationSession } from '../../../domain/exploration/ExplorationSession';
import { ExplorationState } from '../../../domain/exploration/ExplorationState';
import { ActionDecision, LLMPageContext } from '../../ports/LLMPort';
import { PageState } from '../../../domain/browser/PageState';
import { Finding } from '../../../domain/exploration/Finding';
import { PersonaAnalysis } from '../../../domain/personas';

/**
 * Token usage tracking across the session.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result of executing a step.
 */
export interface StepResult {
  success: boolean;
  error?: string;
  resultingUrl: string;
  findings: Finding[];
}

/**
 * Context object passed between state handlers.
 * Encapsulates all per-agent state for the exploration loop.
 */
export interface AgentContext {
  // Identity
  agentId: string;
  session: ExplorationSession;

  // Current state
  currentState: ExplorationState;

  // Page data
  pageState: PageState | null;
  llmPageContext: LLMPageContext | null;

  // Persona suggestions
  personaAnalysis: PersonaAnalysis[] | null;

  // Decision data
  decision: ActionDecision | null;
  originalDecision: ActionDecision | null; // Before validation modifications

  // Execution results
  stepResult: StepResult | null;
  findings: Finding[];

  // URL tracking
  stepsOnCurrentUrl: number;
  lastUrl: string;
  visitedUrls: Set<string>;

  // Progress tracking
  recentActions: string[];
  startTime: number;

  // Token usage
  tokenUsage: TokenUsage;

  // Exit signals
  shouldExit: boolean;
  exitReason: 'completed' | 'max_steps_reached' | 'stopped_by_user' | 'error' | null;
  error: Error | null;

  // Checkpoint
  checkpointReason: string | null;
  waitingForHuman: boolean;
}

/**
 * Creates initial agent context for a new exploration.
 */
export function createInitialContext(agentId: string, session: ExplorationSession): AgentContext {
  return {
    agentId,
    session,
    currentState: ExplorationState.INIT,
    pageState: null,
    llmPageContext: null,
    personaAnalysis: null,
    decision: null,
    originalDecision: null,
    stepResult: null,
    findings: [],
    stepsOnCurrentUrl: 0,
    lastUrl: '',
    visitedUrls: new Set(),
    recentActions: [],
    startTime: Date.now(),
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    shouldExit: false,
    exitReason: null,
    error: null,
    checkpointReason: null,
    waitingForHuman: false,
  };
}

/**
 * Clones context with optional overrides.
 */
export function updateContext(context: AgentContext, updates: Partial<AgentContext>): AgentContext {
  return {
    ...context,
    ...updates,
    // Deep clone mutable fields
    tokenUsage: updates.tokenUsage ?? { ...context.tokenUsage },
    visitedUrls: updates.visitedUrls ?? new Set(context.visitedUrls),
    recentActions: updates.recentActions ?? [...context.recentActions],
    findings: updates.findings ?? [...context.findings],
  };
}
