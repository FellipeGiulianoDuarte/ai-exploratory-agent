import { Finding, FindingSeverity, FindingEvidence } from '../../../src/domain/exploration/Finding';

describe('Finding', () => {
  describe('create', () => {
    it('should create a finding with required properties', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'broken_image',
        severity: 'medium',
        title: 'Broken image detected',
        description: 'An image failed to load',
        pageUrl: 'https://example.com/page',
        pageTitle: 'Example Page',
        stepNumber: 5,
      });

      expect(finding.id).toBeDefined();
      expect(finding.sessionId).toBe('session-1');
      expect(finding.type).toBe('broken_image');
      expect(finding.severity).toBe('medium');
      expect(finding.title).toBe('Broken image detected');
      expect(finding.stepNumber).toBe(5);
    });

    it('should create a finding with custom ID', () => {
      const finding = Finding.create(
        {
          sessionId: 'session-1',
          type: 'console_error',
          severity: 'high',
          title: 'Console error',
          description: 'Error in console',
          pageUrl: 'https://example.com',
          pageTitle: 'Page',
          stepNumber: 1,
        },
        'custom-id'
      );

      expect(finding.id).toBe('custom-id');
    });

    it('should handle optional evidence and metadata', () => {
      const evidence: FindingEvidence = {
        type: 'screenshot',
        description: 'Screenshot of error',
        data: 'screenshot.png',
        capturedAt: new Date(),
      };

      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'functional',
        severity: 'critical',
        title: 'Login broken',
        description: 'Cannot login',
        pageUrl: 'https://example.com/login',
        pageTitle: 'Login',
        stepNumber: 3,
        evidence: [evidence],
        metadata: { buttonId: '#login-btn' },
      });

      expect(finding.evidence).toHaveLength(1);
      expect(finding.metadata).toEqual({ buttonId: '#login-btn' });
    });
  });

  describe('fromBrokenImages', () => {
    it('should create a finding from broken images', () => {
      const finding = Finding.fromBrokenImages(
        'session-1',
        5,
        'https://example.com/page',
        'Test Page',
        2,
        10,
        'img1.jpg: 404\nimg2.png: timeout'
      );

      expect(finding.type).toBe('broken_image');
      expect(finding.severity).toBe('low'); // 2 broken is low
      expect(finding.title).toContain('2');
      expect(finding.title).toContain('broken');
      expect(finding.description).toContain('img1.jpg');
      expect(finding.description).toContain('img2.png');
      expect(finding.metadata.brokenCount).toBe(2);
      expect(finding.metadata.totalImages).toBe(10);
    });

    it('should set medium severity for 3+ broken images', () => {
      const finding = Finding.fromBrokenImages(
        'session-1',
        1,
        'https://example.com',
        'Page',
        3,
        10,
        'Details'
      );

      expect(finding.severity).toBe('medium');
    });

    it('should set high severity for 6+ broken images', () => {
      const finding = Finding.fromBrokenImages(
        'session-1',
        1,
        'https://example.com',
        'Page',
        6,
        10,
        'Details'
      );

      expect(finding.severity).toBe('high');
    });
  });

  describe('fromConsoleErrors', () => {
    it('should create a finding from console errors', () => {
      const errors = [
        'TypeError: Cannot read property x of undefined',
        'ReferenceError: foo is not defined',
      ];

      const finding = Finding.fromConsoleErrors(
        'session-1',
        3,
        'https://example.com/app',
        'App Page',
        errors
      );

      expect(finding.type).toBe('console_error');
      expect(finding.title).toContain('2');
      expect(finding.title).toContain('console');
      expect(finding.description).toContain('TypeError');
      expect(finding.metadata.errorCount).toBe(2);
    });

    it('should set low severity for few errors', () => {
      const errors = ['Error 1', 'Error 2'];
      const finding = Finding.fromConsoleErrors('s1', 1, 'url', 'title', errors);
      expect(finding.severity).toBe('low');
    });

    it('should set medium severity for 4+ errors', () => {
      const errors = ['E1', 'E2', 'E3', 'E4'];
      const finding = Finding.fromConsoleErrors('s1', 1, 'url', 'title', errors);
      expect(finding.severity).toBe('medium');
    });

    it('should set high severity for 11+ errors', () => {
      const errors = Array.from({ length: 11 }, (_, i) => `Error ${i}`);
      const finding = Finding.fromConsoleErrors('s1', 1, 'url', 'title', errors);
      expect(finding.severity).toBe('high');
    });
  });

  describe('addEvidence', () => {
    it('should add evidence to finding', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'usability',
        severity: 'low',
        title: 'Minor issue',
        description: 'Description',
        pageUrl: 'https://example.com',
        pageTitle: 'Page',
        stepNumber: 1,
      });

      const evidence: FindingEvidence = {
        type: 'screenshot',
        description: 'Screenshot 1',
        data: 'screenshot1.png',
        capturedAt: new Date(),
      };

      finding.addEvidence(evidence);

      expect(finding.evidence).toHaveLength(1);
      expect(finding.evidence[0].data).toBe('screenshot1.png');
    });
  });

  describe('markReviewed', () => {
    it('should mark finding as reviewed', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'other',
        severity: 'low',
        title: 'Test',
        description: 'Test',
        pageUrl: 'https://example.com',
        pageTitle: 'Page',
        stepNumber: 1,
      });

      expect(finding.reviewed).toBe(false);

      finding.markReviewed();

      expect(finding.reviewed).toBe(true);
    });

    it('should accept review notes', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'other',
        severity: 'low',
        title: 'Test',
        description: 'Test',
        pageUrl: 'https://example.com',
        pageTitle: 'Page',
        stepNumber: 1,
      });

      finding.markReviewed('This is a known issue');

      expect(finding.reviewNotes).toBe('This is a known issue');
    });
  });

  describe('updateSeverity', () => {
    it('should update severity level', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'functional',
        severity: 'low',
        title: 'Issue',
        description: 'Description',
        pageUrl: 'https://example.com',
        pageTitle: 'Page',
        stepNumber: 1,
      });

      finding.updateSeverity('critical');

      expect(finding.severity).toBe('critical');
    });
  });

  describe('getSeverityEmoji', () => {
    it('should return correct emoji for each severity', () => {
      const createWithSeverity = (severity: FindingSeverity) =>
        Finding.create({
          sessionId: 's1',
          type: 'other',
          severity,
          title: 'T',
          description: 'D',
          pageUrl: 'url',
          pageTitle: 'title',
          stepNumber: 1,
        });

      expect(createWithSeverity('critical').getSeverityEmoji()).toBe('🔴');
      expect(createWithSeverity('high').getSeverityEmoji()).toBe('🟠');
      expect(createWithSeverity('medium').getSeverityEmoji()).toBe('🟡');
      expect(createWithSeverity('low').getSeverityEmoji()).toBe('🔵');
    });
  });

  describe('summarize', () => {
    it('should return a human-readable summary', () => {
      const finding = Finding.create({
        sessionId: 'session-1',
        type: 'broken_image',
        severity: 'high',
        title: 'Multiple broken images',
        description: 'Several images failed to load',
        pageUrl: 'https://example.com/gallery',
        pageTitle: 'Gallery',
        stepNumber: 10,
      });

      const summary = finding.summarize();

      expect(summary).toContain('HIGH');
      expect(summary).toContain('Multiple broken images');
      expect(summary).toContain('gallery');
    });
  });

  describe('toJSON', () => {
    it('should serialize finding to JSON', () => {
      const finding = Finding.create(
        {
          sessionId: 'session-1',
          type: 'network_error',
          severity: 'medium',
          title: 'API Error',
          description: 'API returned 500',
          pageUrl: 'https://example.com/api',
          pageTitle: 'API Page',
          stepNumber: 7,
          metadata: { statusCode: 500 },
        },
        'test-id'
      );

      const json = finding.toJSON();

      expect(json.id).toBe('test-id');
      expect(json.sessionId).toBe('session-1');
      expect(json.type).toBe('network_error');
      expect(json.severity).toBe('medium');
      expect(json.title).toBe('API Error');
      expect(json.metadata).toEqual({ statusCode: 500 });
    });
  });
});
