import {
  ExplorationState,
  isTerminalState,
  isValidTransition,
  TERMINAL_STATES,
  VALID_TRANSITIONS,
} from '../../../src/domain/exploration/ExplorationState';

describe('ExplorationState', () => {
  describe('ExplorationState enum', () => {
    it('should have all required states', () => {
      expect(ExplorationState.INIT).toBe('INIT');
      expect(ExplorationState.EXTRACTING_PAGE).toBe('EXTRACTING_PAGE');
      expect(ExplorationState.COLLECTING_SUGGESTIONS).toBe('COLLECTING_SUGGESTIONS');
      expect(ExplorationState.GETTING_LLM_DECISION).toBe('GETTING_LLM_DECISION');
      expect(ExplorationState.VALIDATING_DECISION).toBe('VALIDATING_DECISION');
      expect(ExplorationState.EXECUTING_ACTION).toBe('EXECUTING_ACTION');
      expect(ExplorationState.PROCESSING_FINDINGS).toBe('PROCESSING_FINDINGS');
      expect(ExplorationState.CHECKING_EXIT).toBe('CHECKING_EXIT');
      expect(ExplorationState.WAITING_CHECKPOINT).toBe('WAITING_CHECKPOINT');
      expect(ExplorationState.DONE).toBe('DONE');
      expect(ExplorationState.ERROR).toBe('ERROR');
    });
  });

  describe('TERMINAL_STATES', () => {
    it('should include DONE and ERROR', () => {
      expect(TERMINAL_STATES.has(ExplorationState.DONE)).toBe(true);
      expect(TERMINAL_STATES.has(ExplorationState.ERROR)).toBe(true);
    });

    it('should not include non-terminal states', () => {
      expect(TERMINAL_STATES.has(ExplorationState.INIT)).toBe(false);
      expect(TERMINAL_STATES.has(ExplorationState.EXTRACTING_PAGE)).toBe(false);
      expect(TERMINAL_STATES.has(ExplorationState.EXECUTING_ACTION)).toBe(false);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for terminal states', () => {
      expect(isTerminalState(ExplorationState.DONE)).toBe(true);
      expect(isTerminalState(ExplorationState.ERROR)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalState(ExplorationState.INIT)).toBe(false);
      expect(isTerminalState(ExplorationState.EXTRACTING_PAGE)).toBe(false);
      expect(isTerminalState(ExplorationState.GETTING_LLM_DECISION)).toBe(false);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('should have valid transitions for INIT', () => {
      const targets = VALID_TRANSITIONS.get(ExplorationState.INIT);
      expect(targets).toContain(ExplorationState.EXTRACTING_PAGE);
      expect(targets).toContain(ExplorationState.ERROR);
    });

    it('should have valid transitions for EXTRACTING_PAGE', () => {
      const targets = VALID_TRANSITIONS.get(ExplorationState.EXTRACTING_PAGE);
      expect(targets).toContain(ExplorationState.COLLECTING_SUGGESTIONS);
      expect(targets).toContain(ExplorationState.ERROR);
    });

    it('should have valid transitions for GETTING_LLM_DECISION', () => {
      const targets = VALID_TRANSITIONS.get(ExplorationState.GETTING_LLM_DECISION);
      expect(targets).toContain(ExplorationState.VALIDATING_DECISION);
      expect(targets).toContain(ExplorationState.DONE);
      expect(targets).toContain(ExplorationState.WAITING_CHECKPOINT);
      expect(targets).toContain(ExplorationState.ERROR);
    });

    it('should have valid transitions for CHECKING_EXIT', () => {
      const targets = VALID_TRANSITIONS.get(ExplorationState.CHECKING_EXIT);
      expect(targets).toContain(ExplorationState.EXTRACTING_PAGE);
      expect(targets).toContain(ExplorationState.DONE);
      expect(targets).toContain(ExplorationState.ERROR);
    });

    it('should have no transitions from terminal states', () => {
      expect(VALID_TRANSITIONS.get(ExplorationState.DONE)).toEqual([]);
      expect(VALID_TRANSITIONS.get(ExplorationState.ERROR)).toEqual([]);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidTransition(ExplorationState.INIT, ExplorationState.EXTRACTING_PAGE)).toBe(true);
      expect(
        isValidTransition(ExplorationState.EXTRACTING_PAGE, ExplorationState.COLLECTING_SUGGESTIONS)
      ).toBe(true);
      expect(isValidTransition(ExplorationState.CHECKING_EXIT, ExplorationState.DONE)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(isValidTransition(ExplorationState.INIT, ExplorationState.DONE)).toBe(false);
      expect(isValidTransition(ExplorationState.EXTRACTING_PAGE, ExplorationState.DONE)).toBe(
        false
      );
      expect(isValidTransition(ExplorationState.DONE, ExplorationState.INIT)).toBe(false);
    });

    it('should return false for transitions from terminal states', () => {
      expect(isValidTransition(ExplorationState.DONE, ExplorationState.EXTRACTING_PAGE)).toBe(
        false
      );
      expect(isValidTransition(ExplorationState.ERROR, ExplorationState.INIT)).toBe(false);
    });

    it('should allow any state to transition to ERROR', () => {
      const nonTerminalStates = [
        ExplorationState.INIT,
        ExplorationState.EXTRACTING_PAGE,
        ExplorationState.COLLECTING_SUGGESTIONS,
        ExplorationState.GETTING_LLM_DECISION,
        ExplorationState.VALIDATING_DECISION,
        ExplorationState.EXECUTING_ACTION,
        ExplorationState.PROCESSING_FINDINGS,
        ExplorationState.CHECKING_EXIT,
        ExplorationState.WAITING_CHECKPOINT,
      ];

      for (const state of nonTerminalStates) {
        expect(isValidTransition(state, ExplorationState.ERROR)).toBe(true);
      }
    });
  });

  describe('State machine flow', () => {
    it('should support the happy path flow', () => {
      // INIT -> EXTRACTING_PAGE -> COLLECTING_SUGGESTIONS -> GETTING_LLM_DECISION
      // -> VALIDATING_DECISION -> EXECUTING_ACTION -> PROCESSING_FINDINGS
      // -> CHECKING_EXIT -> DONE
      const happyPath = [
        [ExplorationState.INIT, ExplorationState.EXTRACTING_PAGE],
        [ExplorationState.EXTRACTING_PAGE, ExplorationState.COLLECTING_SUGGESTIONS],
        [ExplorationState.COLLECTING_SUGGESTIONS, ExplorationState.GETTING_LLM_DECISION],
        [ExplorationState.GETTING_LLM_DECISION, ExplorationState.VALIDATING_DECISION],
        [ExplorationState.VALIDATING_DECISION, ExplorationState.EXECUTING_ACTION],
        [ExplorationState.EXECUTING_ACTION, ExplorationState.PROCESSING_FINDINGS],
        [ExplorationState.PROCESSING_FINDINGS, ExplorationState.CHECKING_EXIT],
        [ExplorationState.CHECKING_EXIT, ExplorationState.DONE],
      ] as const;

      for (const [from, to] of happyPath) {
        expect(isValidTransition(from, to)).toBe(true);
      }
    });

    it('should support looping back to EXTRACTING_PAGE from CHECKING_EXIT', () => {
      expect(
        isValidTransition(ExplorationState.CHECKING_EXIT, ExplorationState.EXTRACTING_PAGE)
      ).toBe(true);
    });

    it('should support checkpoint flow', () => {
      expect(
        isValidTransition(
          ExplorationState.GETTING_LLM_DECISION,
          ExplorationState.WAITING_CHECKPOINT
        )
      ).toBe(true);
      expect(
        isValidTransition(
          ExplorationState.WAITING_CHECKPOINT,
          ExplorationState.GETTING_LLM_DECISION
        )
      ).toBe(true);
      expect(isValidTransition(ExplorationState.WAITING_CHECKPOINT, ExplorationState.DONE)).toBe(
        true
      );
    });
  });
});
