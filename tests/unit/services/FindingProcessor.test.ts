/**
 * Tests for FindingProcessor
 */

import { FindingProcessor } from '../../../src/application/services/FindingProcessor';

describe('FindingProcessor', () => {
  let processor: FindingProcessor;

  beforeEach(() => {
    processor = new FindingProcessor();
  });

  describe('processIssue', () => {
    it('should process a valid issue', () => {
      const result = processor.processIssue('Button is not clickable on mobile devices');

      expect(result.issue).toBe('Button is not clickable on mobile devices');
      expect(result.isFalsePositive).toBe(false);
      expect(result.severity).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('should mark false positives correctly', () => {
      const result = processor.processIssue('No bugs found on this page');

      expect(result.isFalsePositive).toBe(true);
      expect(result.filterReason).toBe('no_bug_pattern');
    });
  });

  describe('processIssues', () => {
    it('should process multiple issues', () => {
      const issues = [
        'Button does not work',
        'No issues found',
        'Console error detected in script',
      ];

      const results = processor.processIssues(issues);

      expect(results).toHaveLength(3);
      expect(results[0].isFalsePositive).toBe(false);
      expect(results[1].isFalsePositive).toBe(true);
      expect(results[2].isFalsePositive).toBe(false);
    });
  });

  describe('getValidIssues', () => {
    it('should filter out false positives', () => {
      const issues = [
        'Button does not work',
        'No bugs found',
        'Everything looks fine',
        'Console error occurred in module',
        'Navigating to next page',
      ];

      const validIssues = processor.getValidIssues(issues);

      expect(validIssues).toHaveLength(2);
      expect(validIssues[0].issue).toBe('Button does not work');
      expect(validIssues[1].issue).toBe('Console error occurred in module');
    });
  });

  describe('false positive detection', () => {
    describe('no bug patterns', () => {
      const noBugPatterns = [
        'No immediate bugs detected',
        'no bugs found on the page',
        'No issues detected during testing',
        'Everything looks good here',
        'Page looks good',
        'Working correctly',
        'Works as expected',
      ];

      it.each(noBugPatterns)('should detect "%s" as false positive', pattern => {
        const result = processor.processIssue(pattern);
        expect(result.isFalsePositive).toBe(true);
      });
    });

    describe('navigation patterns', () => {
      const navigationPatterns = [
        'Navigating to home page',
        'Currently on the products page',
        'Successfully loaded the dashboard',
        'Moving to next section',
      ];

      it.each(navigationPatterns)('should detect "%s" as false positive', pattern => {
        const result = processor.processIssue(pattern);
        expect(result.isFalsePositive).toBe(true);
      });
    });

    describe('speculative patterns', () => {
      const speculativePatterns = [
        'This may affect performance',
        'Could impact user experience',
        'Requires further testing',
        'Server response unknown at this time',
      ];

      it.each(speculativePatterns)('should detect "%s" as false positive', pattern => {
        const result = processor.processIssue(pattern);
        expect(result.isFalsePositive).toBe(true);
      });
    });

    describe('expected behavior patterns', () => {
      const expectedPatterns = [
        'Field accepts text input',
        'Button works correctly',
        'Link works as expected',
      ];

      it.each(expectedPatterns)('should detect "%s" as false positive', pattern => {
        const result = processor.processIssue(pattern);
        expect(result.isFalsePositive).toBe(true);
      });
    });

    describe('vague issues', () => {
      it('should reject very short issues', () => {
        const result = processor.processIssue('Bug');
        expect(result.isFalsePositive).toBe(true);
        expect(result.filterReason).toBe('too_vague');
      });
    });
  });

  describe('severity classification', () => {
    describe('critical severity', () => {
      const criticalIssues = [
        'XSS vulnerability found in search input',
        'SQL injection possible in login form',
        'Security breach detected',
        'Application crash on submit',
        'Data loss when saving form',
        'Password exposed in URL',
      ];

      it.each(criticalIssues)('should classify "%s" as critical', issue => {
        const result = processor.classifyIssueSeverity(issue);
        expect(result).toBe('critical');
      });
    });

    describe('high severity', () => {
      const highIssues = [
        'Undefined value displayed in price field',
        'Null pointer in user profile',
        '[object Object] shown instead of name',
        'NaN displayed in total',
        "Button doesn't work when clicked",
        'Form fails to submit',
        '500 error on checkout',
      ];

      it.each(highIssues)('should classify "%s" as high', issue => {
        const result = processor.classifyIssueSeverity(issue);
        expect(result).toBe('high');
      });
    });

    describe('medium severity', () => {
      const mediumIssues = [
        'Console error in browser',
        'Broken image on home page',
        '404 error for resource',
        'Validation error message unclear',
        'Missing required field indicator',
      ];

      it.each(mediumIssues)('should classify "%s" as medium', issue => {
        const result = processor.classifyIssueSeverity(issue);
        expect(result).toBe('medium');
      });
    });

    describe('low severity', () => {
      const lowIssues = [
        'Typo in button text',
        'Misspelled word in header',
        'Spelling mistake in footer',
        'Contakt should be Contact',
        'Minor cosmetic issue with spacing',
      ];

      it.each(lowIssues)('should classify "%s" as low', issue => {
        const result = processor.classifyIssueSeverity(issue);
        expect(result).toBe('low');
      });
    });
  });

  describe('type classification', () => {
    it('should classify text issues', () => {
      expect(processor.classifyIssueType('Typo in header')).toBe('text_issue');
      expect(processor.classifyIssueType('Misspelled word')).toBe('text_issue');
    });

    it('should classify console errors', () => {
      expect(processor.classifyIssueType('Console error detected')).toBe('console_error');
      expect(processor.classifyIssueType('JavaScript error in script')).toBe('console_error');
    });

    it('should classify broken images', () => {
      expect(processor.classifyIssueType('Broken image on page')).toBe('broken_image');
      expect(processor.classifyIssueType('IMG element not loading')).toBe('broken_image');
    });

    it('should classify security issues', () => {
      expect(processor.classifyIssueType('XSS vulnerability')).toBe('security');
      expect(processor.classifyIssueType('SQL injection risk')).toBe('security');
    });

    it('should classify usability issues', () => {
      expect(processor.classifyIssueType('Usability problem with form')).toBe('usability');
      expect(processor.classifyIssueType('UX issue with navigation')).toBe('usability');
      expect(processor.classifyIssueType('Confusing button placement')).toBe('usability');
    });

    it('should classify UI issues', () => {
      expect(processor.classifyIssueType('Layout broken on mobile')).toBe('ui_issue');
      expect(processor.classifyIssueType('Display issue with modal')).toBe('ui_issue');
    });

    it('should classify network errors', () => {
      expect(processor.classifyIssueType('Network error when loading')).toBe('network_error');
      expect(processor.classifyIssueType('404 not found')).toBe('network_error');
      expect(processor.classifyIssueType('500 server error')).toBe('network_error');
    });

    it('should default to observed_bug for unmatched issues', () => {
      expect(processor.classifyIssueType('Something is wrong with the feature')).toBe(
        'observed_bug'
      );
    });
  });

  describe('getIssueTitlePrefix', () => {
    it('should return correct prefixes', () => {
      expect(processor.getIssueTitlePrefix('broken_image')).toBe('Broken Image');
      expect(processor.getIssueTitlePrefix('console_error')).toBe('Console Error');
      expect(processor.getIssueTitlePrefix('network_error')).toBe('Network Error');
      expect(processor.getIssueTitlePrefix('security')).toBe('Security Issue');
      expect(processor.getIssueTitlePrefix('text_issue')).toBe('Text Issue');
      expect(processor.getIssueTitlePrefix('observed_bug')).toBe('Bug Found');
    });

    it('should return "Issue" for unknown types', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(processor.getIssueTitlePrefix('unknown_type' as any)).toBe('Issue');
    });
  });
});
