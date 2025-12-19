/**
 * Exploration States for the State Machine.
 * Each state represents a distinct phase in the exploration loop.
 */
export enum ExplorationState {
  /** Initial state before exploration starts */
  INIT = 'INIT',

  /** Extracting current page state from browser */
  EXTRACTING_PAGE = 'EXTRACTING_PAGE',

  /** Collecting suggestions from personas */
  COLLECTING_SUGGESTIONS = 'COLLECTING_SUGGESTIONS',

  /** Getting next action decision from LLM */
  GETTING_LLM_DECISION = 'GETTING_LLM_DECISION',

  /** Validating the LLM decision (loop detection, URL validation) */
  VALIDATING_DECISION = 'VALIDATING_DECISION',

  /** Executing the decided action in browser */
  EXECUTING_ACTION = 'EXECUTING_ACTION',

  /** Processing findings from action execution */
  PROCESSING_FINDINGS = 'PROCESSING_FINDINGS',

  /** Checking exit criteria for current page */
  CHECKING_EXIT = 'CHECKING_EXIT',

  /** Waiting for human checkpoint response */
  WAITING_CHECKPOINT = 'WAITING_CHECKPOINT',

  /** Exploration completed successfully */
  DONE = 'DONE',

  /** Exploration ended with error */
  ERROR = 'ERROR',
}

/**
 * Represents a state transition in the state machine.
 */
export interface StateTransition {
  from: ExplorationState;
  to: ExplorationState;
  condition?: string;
}

/**
 * Terminal states that end the exploration.
 */
export const TERMINAL_STATES: ReadonlySet<ExplorationState> = new Set([
  ExplorationState.DONE,
  ExplorationState.ERROR,
]);

/**
 * Check if a state is terminal.
 */
export function isTerminalState(state: ExplorationState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Valid state transitions map.
 * Defines which states can transition to which other states.
 */
export const VALID_TRANSITIONS: ReadonlyMap<ExplorationState, ExplorationState[]> = new Map([
  [ExplorationState.INIT, [ExplorationState.EXTRACTING_PAGE, ExplorationState.ERROR]],
  [
    ExplorationState.EXTRACTING_PAGE,
    [ExplorationState.COLLECTING_SUGGESTIONS, ExplorationState.ERROR],
  ],
  [
    ExplorationState.COLLECTING_SUGGESTIONS,
    [ExplorationState.GETTING_LLM_DECISION, ExplorationState.ERROR],
  ],
  [
    ExplorationState.GETTING_LLM_DECISION,
    [
      ExplorationState.VALIDATING_DECISION,
      ExplorationState.DONE,
      ExplorationState.WAITING_CHECKPOINT,
      ExplorationState.ERROR,
    ],
  ],
  [
    ExplorationState.VALIDATING_DECISION,
    [
      ExplorationState.EXECUTING_ACTION,
      ExplorationState.GETTING_LLM_DECISION,
      ExplorationState.ERROR,
    ],
  ],
  [
    ExplorationState.EXECUTING_ACTION,
    [ExplorationState.PROCESSING_FINDINGS, ExplorationState.ERROR],
  ],
  [
    ExplorationState.PROCESSING_FINDINGS,
    [ExplorationState.CHECKING_EXIT, ExplorationState.WAITING_CHECKPOINT, ExplorationState.ERROR],
  ],
  [
    ExplorationState.CHECKING_EXIT,
    [ExplorationState.EXTRACTING_PAGE, ExplorationState.DONE, ExplorationState.ERROR],
  ],
  [
    ExplorationState.WAITING_CHECKPOINT,
    [
      ExplorationState.EXTRACTING_PAGE,
      ExplorationState.DONE,
      ExplorationState.GETTING_LLM_DECISION,
      ExplorationState.ERROR,
    ],
  ],
  [ExplorationState.DONE, []],
  [ExplorationState.ERROR, []],
]);

/**
 * Validate if a state transition is allowed.
 */
export function isValidTransition(from: ExplorationState, to: ExplorationState): boolean {
  const validTargets = VALID_TRANSITIONS.get(from);
  return validTargets?.includes(to) ?? false;
}
