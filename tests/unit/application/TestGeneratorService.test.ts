import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TestGeneratorService } from '../../../src/application/services/TestGeneratorService';
import { Finding } from '../../../src/domain/exploration/Finding';

describe('TestGeneratorService', () => {
  let service: TestGeneratorService;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-generator-${Date.now()}`);
    service = new TestGeneratorService({
      outputDir: testDir,
      baseUrl: 'https://example.com',
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createFinding = (
    overrides: Partial<Parameters<typeof Finding.create>[0]> = {}
  ): Finding => {
    return Finding.create({
      sessionId: 'test-session',
      type: 'observed_bug',
      severity: 'high',
      title: 'Test Bug',
      description: 'A test bug description',
      pageUrl: 'https://example.com/#/page',
      pageTitle: 'Test Page',
      stepNumber: 1,
      ...overrides,
    });
  };

  describe('generateTests', () => {
    it('should generate a test file', async () => {
      const findings = [
        createFinding({ title: 'Bug 1', description: 'Found undefined text on page' }),
      ];

      const result = await service.generateTests(findings, 'session-123');

      expect(result.filePath).toBeDefined();
      expect(result.testCount).toBeGreaterThan(0);

      const exists = await fs
        .access(result.filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should include proper imports in generated file', async () => {
      const findings = [createFinding()];

      const result = await service.generateTests(findings, 'session-456');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain("import { test, expect } from '@playwright/test'");
    });

    it('should not contain "undefined" as literal test text', async () => {
      const findings = [
        createFinding({
          title: 'Found undefined in navigation',
          description: 'UNDEFINED text appears in navigation menu',
        }),
      ];

      const result = await service.generateTests(findings, 'session-789');
      const content = await fs.readFile(result.filePath, 'utf-8');

      // The test should check for undefined but not have it as a value that would fail
      expect(content).toContain("expect(pageContent).not.toContain('undefined')");
      expect(content).toContain("expect(pageContent).not.toContain('UNDEFINED')");
    });

    it('should generate tests for text issues with typos', async () => {
      const findings = [
        createFinding({
          type: 'text_issue',
          title: "Typo: 'Contakt' instead of 'Contact'",
          description: "Typo in navigation label: 'Contakt' instead of 'Contact'",
        }),
      ];

      const result = await service.generateTests(findings, 'session-typo');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain('Contakt');
      expect(content).toContain('typo');
    });

    it('should generate tests for dropdown errors', async () => {
      const findings = [
        createFinding({
          type: 'observed_bug',
          title: 'Dropdown shows error messages',
          description: "Dropdown shows 'Error 101: Subject not found' as an option",
        }),
      ];

      const result = await service.generateTests(findings, 'session-dropdown');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain('select');
      expect(content).toContain('option');
    });

    it('should exclude performance and security findings', async () => {
      const findings = [
        createFinding({ type: 'performance', title: 'Slow page load' }),
        createFinding({ type: 'security', title: 'Missing HTTPS' }),
        createFinding({ type: 'observed_bug', title: 'Visible bug' }),
      ];

      const result = await service.generateTests(findings, 'session-filter');

      expect(result.excludedFindings).toHaveLength(2);
      expect(result.testCount).toBe(1);
    });

    it('should group tests by page URL', async () => {
      const findings = [
        createFinding({ pageUrl: 'https://example.com/#/page1', title: 'Bug on page 1' }),
        createFinding({ pageUrl: 'https://example.com/#/page1', title: 'Another bug on page 1' }),
        createFinding({ pageUrl: 'https://example.com/#/page2', title: 'Bug on page 2' }),
      ];

      const result = await service.generateTests(findings, 'session-grouped');
      const content = await fs.readFile(result.filePath, 'utf-8');

      // Should have nested describe blocks for pages
      expect(content).toMatch(/test\.describe\('Page1'/i);
      expect(content).toMatch(/test\.describe\('Page2'/i);
    });

    it('should include finding ID in test comments', async () => {
      const finding = createFinding({ title: 'Specific bug' });

      const result = await service.generateTests([finding], 'session-id-test');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain(`Finding ID: ${finding.id}`);
    });

    it('should generate valid TypeScript syntax', async () => {
      const findings = [createFinding({ title: 'Bug with \'quotes\' and "double quotes"' })];

      const result = await service.generateTests(findings, 'session-syntax');
      const content = await fs.readFile(result.filePath, 'utf-8');

      // The generated test should be valid - no unmatched quotes that break syntax
      // Check the sanitized title doesn't contain problematic characters
      expect(content).toContain('Bug with quotes and double quotes');
      expect(content).not.toContain("'quotes'"); // Quotes should be sanitized
    });

    it('should handle empty findings array', async () => {
      const result = await service.generateTests([], 'empty-session');

      expect(result.testCount).toBe(0);
      expect(result.includedFindings).toHaveLength(0);
    });
  });

  describe('test content validation', () => {
    it('should generate tests that check for error patterns', async () => {
      const findings = [
        createFinding({
          type: 'observed_bug',
          description: 'Error 202: Translation error appears in dropdown',
        }),
      ];

      const result = await service.generateTests(findings, 'session-error');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain('Error');
      expect(content).toContain('expect');
    });

    it('should include page navigation in each test', async () => {
      const findings = [createFinding({ pageUrl: 'https://example.com/#/contact' })];

      const result = await service.generateTests(findings, 'session-nav');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain("await page.goto('https://example.com/#/contact')");
      expect(content).toContain('waitForLoadState');
    });

    it('should include severity in test name', async () => {
      const findings = [
        createFinding({ severity: 'critical', title: 'Critical bug' }),
        createFinding({ severity: 'low', title: 'Minor issue' }),
      ];

      const result = await service.generateTests(findings, 'session-severity');
      const content = await fs.readFile(result.filePath, 'utf-8');

      expect(content).toContain('[CRITICAL]');
      expect(content).toContain('[LOW]');
    });
  });
});
