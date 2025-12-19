/**
 * Tests for ExplorationConfig constants
 */

import {
  EXPLORATION,
  NAVIGATION,
  PERSONA,
  EXIT_CRITERIA,
  DEDUPLICATION,
  LOOP_DETECTION,
} from '../../../src/application/config/ExplorationConfig';

describe('ExplorationConfig', () => {
  describe('EXPLORATION constants', () => {
    it('should have default target URL', () => {
      expect(EXPLORATION.DEFAULT_TARGET_URL).toBe('https://with-bugs.practicesoftwaretesting.com');
    });

    it('should have default max steps', () => {
      expect(EXPLORATION.DEFAULT_MAX_STEPS).toBe(50);
    });

    it('should have default checkpoint interval', () => {
      expect(EXPLORATION.DEFAULT_CHECKPOINT_INTERVAL).toBe(10);
    });

    it('should have default progress summary interval', () => {
      expect(EXPLORATION.DEFAULT_PROGRESS_SUMMARY_INTERVAL).toBe(5);
    });

    it('should have default min confidence threshold', () => {
      expect(EXPLORATION.DEFAULT_MIN_CONFIDENCE_THRESHOLD).toBe(0.6);
    });

    it('should have default checkpoint on tool findings', () => {
      expect(EXPLORATION.DEFAULT_CHECKPOINT_ON_TOOL_FINDINGS).toBe(true);
    });

    it('should have default enable personas', () => {
      expect(EXPLORATION.DEFAULT_ENABLE_PERSONAS).toBe(true);
    });

    it('should have default objective', () => {
      expect(EXPLORATION.DEFAULT_OBJECTIVE).toContain('Explore the web application');
    });
  });

  describe('NAVIGATION constants', () => {
    it('should have default wait time', () => {
      expect(NAVIGATION.DEFAULT_WAIT_TIME).toBe(2000);
    });

    it('should have default step timeout', () => {
      expect(NAVIGATION.DEFAULT_STEP_TIMEOUT).toBe(30000);
    });
  });

  describe('PERSONA constants', () => {
    it('should have default max suggestions per persona', () => {
      expect(PERSONA.DEFAULT_MAX_SUGGESTIONS_PER_PERSONA).toBe(5);
    });

    it('should have all persona defaults enabled', () => {
      expect(PERSONA.DEFAULT_ENABLE_SECURITY).toBe(true);
      expect(PERSONA.DEFAULT_ENABLE_MONITOR).toBe(true);
      expect(PERSONA.DEFAULT_ENABLE_VALIDATION).toBe(true);
      expect(PERSONA.DEFAULT_ENABLE_CHAOS).toBe(true);
      expect(PERSONA.DEFAULT_ENABLE_EDGE_CASE).toBe(true);
    });
  });

  describe('EXIT_CRITERIA constants', () => {
    it('should have default max actions per page', () => {
      expect(EXIT_CRITERIA.DEFAULT_MAX_ACTIONS_PER_PAGE).toBe(20);
    });

    it('should have default max time per page', () => {
      expect(EXIT_CRITERIA.DEFAULT_MAX_TIME_PER_PAGE).toBe(600000);
    });

    it('should have default min element interactions', () => {
      expect(EXIT_CRITERIA.DEFAULT_MIN_ELEMENT_INTERACTIONS).toBe(3);
    });

    it('should have default exit after bugs found', () => {
      expect(EXIT_CRITERIA.DEFAULT_EXIT_AFTER_BUGS_FOUND).toBe(3);
    });

    it('should have default required tools', () => {
      expect(EXIT_CRITERIA.DEFAULT_REQUIRED_TOOLS).toBe('analyze,find_broken_images');
    });
  });

  describe('DEDUPLICATION constants', () => {
    it('should have default similarity threshold', () => {
      expect(DEDUPLICATION.DEFAULT_SIMILARITY_THRESHOLD).toBe(0.6);
    });

    it('should have default enable pattern matching', () => {
      expect(DEDUPLICATION.DEFAULT_ENABLE_PATTERN_MATCHING).toBe(true);
    });

    it('should have default enable semantic matching', () => {
      expect(DEDUPLICATION.DEFAULT_ENABLE_SEMANTIC_MATCHING).toBe(true);
    });
  });

  describe('LOOP_DETECTION constants', () => {
    it('should have default max action repetitions', () => {
      expect(LOOP_DETECTION.DEFAULT_MAX_ACTION_REPETITIONS).toBe(3);
    });
  });
});
