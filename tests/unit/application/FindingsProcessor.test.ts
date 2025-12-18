import { FindingsProcessor } from '../../../src/application/services/FindingsProcessor';
import { BugDeduplicationService } from '../../../src/application/services/BugDeduplicationService';
import { PageExplorationContext } from '../../../src/application/services/PageExplorationContext';
import { ActionDecision } from '../../../src/domain/exploration/ActionTypes';
import { LLMPageContext } from '../../../src/application/ports/LLMPort';

describe('FindingsProcessor', () => {
  let findingsProcessor: FindingsProcessor;
  let bugDeduplication: BugDeduplicationService;
  let pageContext: PageExplorationContext;

  beforeEach(() => {
    bugDeduplication = new BugDeduplicationService({
      similarityThreshold: 0.6,
      enablePatternMatching: true,
      enableSemanticMatching: true,
    });

    pageContext = new PageExplorationContext({
      maxActionsPerPage: 8,
      maxTimePerPage: 60000,
      requiredTools: [],
      minElementInteractions: 3,
      exitAfterBugsFound: 3,
    });

    pageContext.startNewPage('https://example.com', 'Test Page');

    findingsProcessor = new FindingsProcessor({
      bugDeduplication,
      pageContext,
    });
  });

  describe('isFalsePositive', () => {
    it('should filter "no bugs found" messages', () => {
      expect(findingsProcessor.isFalsePositive('no bugs found on this page')).toBe(true);
      expect(findingsProcessor.isFalsePositive('No issues detected')).toBe(true);
      expect(findingsProcessor.isFalsePositive('no immediate bugs visible')).toBe(true);
      expect(findingsProcessor.isFalsePositive('everything looks good')).toBe(true);
      expect(findingsProcessor.isFalsePositive('Page looks good, working correctly')).toBe(true);
    });

    it('should filter navigation descriptions', () => {
      expect(findingsProcessor.isFalsePositive('navigating to the login page')).toBe(true);
      expect(findingsProcessor.isFalsePositive('currently on the homepage')).toBe(true);
      expect(findingsProcessor.isFalsePositive('successfully loaded the page')).toBe(true);
      expect(findingsProcessor.isFalsePositive('moving to next section')).toBe(true);
    });

    it('should filter speculative statements', () => {
      expect(findingsProcessor.isFalsePositive('actual outcome requires submission')).toBe(true);
      expect(findingsProcessor.isFalsePositive('may affect performance')).toBe(true);
      expect(findingsProcessor.isFalsePositive('needs further investigation')).toBe(true);
      expect(findingsProcessor.isFalsePositive('could impact users')).toBe(true);
    });

    it('should filter expected behavior descriptions', () => {
      expect(findingsProcessor.isFalsePositive('input field accepts text')).toBe(true);
      expect(findingsProcessor.isFalsePositive('button works as expected')).toBe(true);
      expect(findingsProcessor.isFalsePositive('form accepts special characters')).toBe(true);
    });

    it('should filter short/vague issues', () => {
      expect(findingsProcessor.isFalsePositive('ok')).toBe(true);
      expect(findingsProcessor.isFalsePositive('a b')).toBe(true);
    });

    it('should NOT filter real bugs', () => {
      expect(findingsProcessor.isFalsePositive('Button click returns undefined value')).toBe(false);
      expect(findingsProcessor.isFalsePositive('Form validation fails silently')).toBe(false);
      expect(findingsProcessor.isFalsePositive('JavaScript error in console')).toBe(false);
      expect(findingsProcessor.isFalsePositive('Image broken on product page')).toBe(false);
      expect(findingsProcessor.isFalsePositive('Typo in the contact form label')).toBe(false);
    });
  });

  describe('classifyIssueSeverity', () => {
    it('should classify CRITICAL severity', () => {
      expect(findingsProcessor.classifyIssueSeverity('XSS vulnerability in input')).toBe(
        'critical'
      );
      expect(findingsProcessor.classifyIssueSeverity('SQL injection possible')).toBe('critical');
      expect(findingsProcessor.classifyIssueSeverity('Unauthorized access to user data')).toBe(
        'critical'
      );
      expect(findingsProcessor.classifyIssueSeverity('Application crash on submit')).toBe(
        'critical'
      );
      expect(findingsProcessor.classifyIssueSeverity('Password exposed in URL')).toBe('critical');
    });

    it('should classify HIGH severity', () => {
      expect(findingsProcessor.classifyIssueSeverity('Shows undefined in price')).toBe('high');
      expect(findingsProcessor.classifyIssueSeverity('Button not working')).toBe('high');
      expect(findingsProcessor.classifyIssueSeverity('Form fails to submit')).toBe('high');
      expect(findingsProcessor.classifyIssueSeverity('NaN displayed in total')).toBe('high');
      expect(findingsProcessor.classifyIssueSeverity('Server returns 500 error')).toBe('high');
    });

    it('should classify MEDIUM severity', () => {
      expect(findingsProcessor.classifyIssueSeverity('Console error on page load')).toBe('medium');
      expect(findingsProcessor.classifyIssueSeverity('Broken image in header')).toBe('medium');
      expect(findingsProcessor.classifyIssueSeverity('404 error on link')).toBe('medium');
      expect(findingsProcessor.classifyIssueSeverity('Validation message missing')).toBe('medium');
    });

    it('should classify LOW severity', () => {
      expect(findingsProcessor.classifyIssueSeverity('Typo in button text')).toBe('low');
      expect(findingsProcessor.classifyIssueSeverity('Word misspelled in description')).toBe('low');
      expect(findingsProcessor.classifyIssueSeverity('Contakt instead of Contact')).toBe('low');
    });

    it('should default to LOW for unclassified issues', () => {
      expect(findingsProcessor.classifyIssueSeverity('Minor cosmetic issue')).toBe('low');
    });
  });

  describe('classifyIssueType', () => {
    it('should classify text issues', () => {
      expect(findingsProcessor.classifyIssueType('Typo in header')).toBe('text_issue');
      expect(findingsProcessor.classifyIssueType('Misspelled word')).toBe('text_issue');
    });

    it('should classify console errors', () => {
      expect(findingsProcessor.classifyIssueType('Console error logged')).toBe('console_error');
      expect(findingsProcessor.classifyIssueType('JavaScript error thrown')).toBe('console_error');
    });

    it('should classify broken images', () => {
      expect(findingsProcessor.classifyIssueType('Broken image on page')).toBe('broken_image');
      expect(findingsProcessor.classifyIssueType('Product img not loading')).toBe('broken_image');
    });

    it('should classify security issues', () => {
      expect(findingsProcessor.classifyIssueType('XSS vulnerability')).toBe('security');
      expect(findingsProcessor.classifyIssueType('Potential injection point')).toBe('security');
    });

    it('should classify usability issues', () => {
      expect(findingsProcessor.classifyIssueType('Confusing navigation')).toBe('usability');
      expect(findingsProcessor.classifyIssueType('Poor UX flow')).toBe('usability');
    });

    it('should classify UI issues', () => {
      expect(findingsProcessor.classifyIssueType('Layout broken')).toBe('ui_issue');
      expect(findingsProcessor.classifyIssueType('Display issue on mobile')).toBe('ui_issue');
    });

    it('should classify network errors', () => {
      expect(findingsProcessor.classifyIssueType('404 not found')).toBe('network_error');
      expect(findingsProcessor.classifyIssueType('500 server error')).toBe('network_error');
    });

    it('should default to observed_bug', () => {
      expect(findingsProcessor.classifyIssueType('Something weird happened')).toBe('observed_bug');
    });
  });

  describe('processObservedIssues', () => {
    const mockPageContext: LLMPageContext = {
      url: 'https://example.com/test',
      title: 'Test Page',
      visibleText: 'Test content',
      elements: [],
      consoleErrors: [],
      networkErrors: [],
    };

    it('should process valid observed issues', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
        observedIssues: ['Button shows undefined value'],
      };

      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        1,
        mockPageContext
      );

      expect(results).toHaveLength(1);
      expect(results[0].isDuplicate).toBe(false);
      expect(results[0].finding).toBeDefined();
      expect(results[0].finding.title).toContain('Bug Found');
    });

    it('should filter false positives', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
        observedIssues: ['No bugs found on this page'],
      };

      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        1,
        mockPageContext
      );

      expect(results).toHaveLength(0);
    });

    it('should detect duplicates', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
        observedIssues: ['Button shows undefined value'],
      };

      // Process first time
      findingsProcessor.processObservedIssues(decision, 'session-123', 1, mockPageContext);

      // Process same issue again
      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        2,
        mockPageContext
      );

      expect(results).toHaveLength(1);
      expect(results[0].isDuplicate).toBe(true);
    });

    it('should handle empty observedIssues', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
      };

      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        1,
        mockPageContext
      );

      expect(results).toHaveLength(0);
    });

    it('should correctly classify and assign severity', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
        observedIssues: ['XSS vulnerability in form input'],
      };

      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        1,
        mockPageContext
      );

      expect(results).toHaveLength(1);
      expect(results[0].finding.severity).toBe('critical');
      expect(results[0].finding.type).toBe('security');
    });
  });

  describe('getIssueTitlePrefix', () => {
    it('should return correct prefixes', () => {
      expect(findingsProcessor.getIssueTitlePrefix('broken_image')).toBe('Broken Image');
      expect(findingsProcessor.getIssueTitlePrefix('console_error')).toBe('Console Error');
      expect(findingsProcessor.getIssueTitlePrefix('security')).toBe('Security Issue');
      expect(findingsProcessor.getIssueTitlePrefix('text_issue')).toBe('Text Issue');
      expect(findingsProcessor.getIssueTitlePrefix('observed_bug')).toBe('Bug Found');
    });
  });

  describe('clear', () => {
    it('should clear deduplication state', () => {
      const decision: ActionDecision = {
        action: 'click',
        selector: '#test',
        reasoning: 'Testing',
        confidence: 0.8,
        observedIssues: ['Button shows undefined value'],
      };

      const mockPageContext: LLMPageContext = {
        url: 'https://example.com/test',
        title: 'Test Page',
        visibleText: 'Test content',
        elements: [],
        consoleErrors: [],
        networkErrors: [],
      };

      // Process first time
      findingsProcessor.processObservedIssues(decision, 'session-123', 1, mockPageContext);

      // Clear
      findingsProcessor.clear();

      // Process same issue - should not be duplicate after clear
      const results = findingsProcessor.processObservedIssues(
        decision,
        'session-123',
        2,
        mockPageContext
      );

      expect(results).toHaveLength(1);
      expect(results[0].isDuplicate).toBe(false);
    });
  });
});
