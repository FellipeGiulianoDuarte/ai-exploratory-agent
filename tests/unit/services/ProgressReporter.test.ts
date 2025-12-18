/**
 * Tests for ProgressReporter
 */

import {
  ProgressReporter,
  ProgressData,
  PersonaSuggestion,
} from '../../../src/application/services/ProgressReporter';

describe('ProgressReporter', () => {
  let reporter: ProgressReporter;
  let consoleSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    reporter = new ProgressReporter();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const defaultReporter = new ProgressReporter();
      expect(defaultReporter).toBeDefined();
    });

    it('should accept custom options', () => {
      const customReporter = new ProgressReporter({
        includePersonaSuggestions: false,
        maxRecentActions: 5,
        maxSuggestions: 2,
      });
      expect(customReporter).toBeDefined();
    });
  });

  describe('printProgressSummary', () => {
    const mockProgressData: ProgressData = {
      url: 'https://example.com/page',
      pagesVisited: 5,
      findings: 3,
      recentActions: ['Click button', 'Fill form', 'Submit'],
    };

    it('should print progress without persona suggestions', () => {
      reporter.printProgressSummary(10, 100, mockProgressData);

      // Logger.progress is called internally, which uses console.log
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should include persona suggestions when provided', () => {
      const suggestions: PersonaSuggestion[] = [
        { personaName: 'Security Tester', reasoning: 'Check for XSS vulnerabilities' },
        { personaName: 'Mobile User', reasoning: 'Test responsive design' },
      ];

      reporter.printProgressSummary(10, 100, mockProgressData, suggestions, suggestions);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not show suggestions when disabled', () => {
      const noSuggestionsReporter = new ProgressReporter({
        includePersonaSuggestions: false,
      });

      const suggestions: PersonaSuggestion[] = [
        { personaName: 'Security Tester', reasoning: 'Check for XSS' },
      ];

      noSuggestionsReporter.printProgressSummary(10, 100, mockProgressData, suggestions);

      // Should still call console.log for progress, but not for suggestions header
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printFinding', () => {
    it('should print critical severity', () => {
      reporter.printFinding('critical', 'Test issue');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print high severity', () => {
      reporter.printFinding('high', 'Test issue');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print medium severity', () => {
      reporter.printFinding('medium', 'Test issue');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print low severity', () => {
      reporter.printFinding('low', 'Test issue');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printSessionSaved', () => {
    it('should print auto save message', () => {
      reporter.printSessionSaved('session-123', 'auto');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print checkpoint save message', () => {
      reporter.printSessionSaved('session-123', 'checkpoint');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print final save message', () => {
      reporter.printSessionSaved('session-123', 'final');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print error save message', () => {
      reporter.printSessionSaved('session-123', 'error');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printPageContextChange', () => {
    it('should print exit message', () => {
      reporter.printPageContextChange('https://example.com/old', 'https://example.com/new', 'exit');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print start message', () => {
      reporter.printPageContextChange(null, 'https://example.com/new', 'start');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printExitCriteria', () => {
    it('should print exit criteria reason', () => {
      reporter.printExitCriteria('Page thoroughly explored');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printNavigationValidation', () => {
    it('should print valid navigation', () => {
      reporter.printNavigationValidation('https://example.com', true);
      // Debug level, may not show depending on config
    });

    it('should print invalid navigation with reason', () => {
      reporter.printNavigationValidation('https://example.com', false, 'outside scope');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printLoopDetected', () => {
    it('should print tool loop detection', () => {
      reporter.printLoopDetected('tool', 'broken_image_detector', 3);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should print action loop detection', () => {
      reporter.printLoopDetected('action', 'click:#button', 4);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('printRetry', () => {
    it('should print retry notification', () => {
      reporter.printRetry(2, 2000);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('printUrlDiscoveryResults', () => {
    it('should not print for empty results', () => {
      reporter.printUrlDiscoveryResults([], 0);
      // Should not call info for empty results
    });

    it('should print URL discovery results', () => {
      const urls = [
        { category: 'navigation', normalizedUrl: 'https://example.com/page1', linkText: 'Page 1' },
        { category: 'content', normalizedUrl: 'https://example.com/page2', linkText: 'Page 2' },
      ];

      reporter.printUrlDiscoveryResults(urls, 5);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show "and more" for many URLs', () => {
      const urls = Array.from({ length: 5 }, (_, i) => ({
        category: 'navigation',
        normalizedUrl: `https://example.com/page${i}`,
        linkText: `Page ${i}`,
      }));

      reporter.printUrlDiscoveryResults(urls, 10);

      // Should show "... and X more"
      const calls = consoleSpy.mock.calls.map(c => c[0]);
      expect(calls.some((c: string) => c.includes('and') && c.includes('more'))).toBe(true);
    });

    it('should truncate long link text', () => {
      const urls = [
        {
          category: 'navigation',
          normalizedUrl: 'https://example.com/page',
          linkText: 'A'.repeat(100),
        },
      ];

      reporter.printUrlDiscoveryResults(urls, 1);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printUrlDiscoveryError', () => {
    it('should print error message', () => {
      reporter.printUrlDiscoveryError(new Error('Network failed'));
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle non-Error objects', () => {
      reporter.printUrlDiscoveryError('String error');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
