import * as fs from 'fs/promises';
import * as path from 'path';
import { Finding, FindingType, FindingSeverity } from '../../domain/exploration/Finding';

/**
 * Configuration for test generation.
 */
export interface TestGenerationConfig {
  /** Output directory for generated tests */
  outputDir: string;
  /** Test file name prefix */
  filePrefix: string;
  /** Include assertions for specific finding types */
  includeAssertions: boolean;
  /** Group tests by page URL */
  groupByPage: boolean;
  /** Base URL for the application */
  baseUrl: string;
  /** Timeout for each test in milliseconds */
  testTimeout: number;
  /** List of console error patterns to ignore (e.g., '404', '401', 'favicon') */
  ignoreConsoleErrors?: string[];
}

const DEFAULT_CONFIG: TestGenerationConfig = {
  outputDir: './generated-tests',
  filePrefix: 'bug-regression',
  includeAssertions: true,
  groupByPage: true,
  baseUrl: 'https://with-bugs.practicesoftwaretesting.com',
  testTimeout: 30000,
  // Whitelist common expected errors
  ignoreConsoleErrors: ['404', '401', 'favicon', 'Unauthorized', 'failed to load resource'],
};

/**
 * Result of test generation.
 */
export interface TestGenerationResult {
  /** Path to the generated test file */
  filePath: string;
  /** Number of tests generated */
  testCount: number;
  /** Findings included in tests */
  includedFindings: string[];
  /** Findings excluded (not suitable for test generation) */
  excludedFindings: string[];
}

/**
 * Test case structure.
 */
interface TestCase {
  name: string;
  pageUrl: string;
  findingType: FindingType;
  severity: FindingSeverity;
  description: string;
  assertions: string[];
  findingId: string;
}

/**
 * Service for generating Playwright test scripts from discovered findings.
 */
export class TestGeneratorService {
  private config: TestGenerationConfig;

  constructor(config: Partial<TestGenerationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate Playwright tests from findings.
   */
  async generateTests(findings: Finding[], sessionId: string): Promise<TestGenerationResult> {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Filter and transform findings to test cases
    const testCases: TestCase[] = [];
    const excludedFindings: string[] = [];

    for (const finding of findings) {
      const testCase = this.findingToTestCase(finding);
      if (testCase) {
        testCases.push(testCase);
      } else {
        excludedFindings.push(finding.id);
      }
    }

    // Generate test file content
    const testContent = this.generateTestFileContent(testCases, sessionId);

    // Write test file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${this.config.filePrefix}-${timestamp}-${sessionId.substring(0, 8)}.spec.ts`;
    const filePath = path.join(this.config.outputDir, filename);

    await fs.writeFile(filePath, testContent, 'utf-8');

    return {
      filePath,
      testCount: testCases.length,
      includedFindings: testCases.map(tc => tc.findingId),
      excludedFindings,
    };
  }

  /**
   * Convert a finding to a test case.
   */
  private findingToTestCase(finding: Finding): TestCase | null {
    // Skip findings that are not suitable for automated testing
    // - performance/security are architectural, not testable via browser automation
    if (finding.type === 'performance' || finding.type === 'security') {
      return null;
    }

    const assertions = this.generateAssertions(finding);

    // Skip if no meaningful assertions can be generated
    if (assertions.length === 0) {
      return null;
    }

    return {
      name: this.sanitizeTestName(finding.title),
      pageUrl: finding.pageUrl,
      findingType: finding.type,
      severity: finding.severity,
      description: finding.description,
      assertions,
      findingId: finding.id,
    };
  }

  /**
   * Generate assertions for a finding.
   */
  private generateAssertions(finding: Finding): string[] {
    const assertions: string[] = [];

    switch (finding.type) {
      case 'broken_image':
        assertions.push(...this.generateBrokenImageAssertions(finding));
        break;

      case 'text_issue':
        assertions.push(...this.generateTextIssueAssertions(finding));
        break;

      case 'observed_bug':
        assertions.push(...this.generateObservedBugAssertions(finding));
        break;

      case 'ui_issue':
        assertions.push(...this.generateUIIssueAssertions(finding));
        break;

      case 'console_error':
        assertions.push(...this.generateConsoleErrorAssertions(finding));
        break;

      case 'functional':
        assertions.push(...this.generateFunctionalAssertions(finding));
        break;

      case 'usability':
      case 'accessibility':
        assertions.push(...this.generateAccessibilityAssertions(finding));
        break;

      default:
        assertions.push(...this.generateGenericAssertions(finding));
    }

    return assertions;
  }

  /**
   * Generate assertions for broken images.
   */
  private generateBrokenImageAssertions(_finding: Finding): string[] {
    return [
      `// Check for broken images on the page`,
      `const images = await page.locator('img').all();`,
      `for (const img of images) {`,
      `  const src = await img.getAttribute('src');`,
      `  if (src) {`,
      `    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);`,
      `    expect(naturalWidth, \`Image \${src} should have loaded\`).toBeGreaterThan(0);`,
      `  }`,
      `}`,
    ];
  }

  /**
   * Generate assertions for text issues.
   * Uses soft assertions for typos to avoid brittle tests.
   */
  private generateTextIssueAssertions(finding: Finding): string[] {
    const assertions: string[] = [];
    const description = finding.description.toLowerCase();

    // Extract potential misspellings or problematic text
    if (description.includes('undefined')) {
      assertions.push(
        `// Check for 'undefined' text on the page`,
        `const pageContent = await page.content();`,
        `const undefinedCount = (pageContent.match(/\\bundefined\\b|\\bUNDEFINED\\b/gi) || []).length;`,
        `expect(undefinedCount, 'Page should not contain literal "undefined" text').toBe(0);`
      );
    }

    if (description.includes('typo') || description.includes('misspell')) {
      // Try to extract the misspelled word
      const typoMatch = description.match(/['"]([^'"]+)['"]\s*instead\s*of\s*['"]([^'"]+)['"]/i);
      if (typoMatch) {
        const wrongWord = typoMatch[1];
        const correctWord = typoMatch[2];
        assertions.push(
          `// Check for typo: '${wrongWord}' should be '${correctWord}'`,
          `const pageText = await page.textContent('body');`,
          `if (pageText?.includes('${wrongWord}')) {`,
          `  expect(pageText).not.toContain('${wrongWord}');`,
          `}`
        );
      }
    }

    if (description.includes('error')) {
      // Soft check for error text
      assertions.push(
        `// Check for unexpected error messages`,
        `const bodyText = await page.textContent('body');`,
        `const errorIndicators = (bodyText?.match(/\\bError\\b|\\bFAILED\\b/gi) || []).length;`,
        `expect(errorIndicators, 'Page should not show multiple error indicators').toBeLessThanOrEqual(2);`
      );
    }

    // Default assertion if nothing specific was found
    if (assertions.length === 0) {
      assertions.push(
        `// Ensure page has meaningful content`,
        `const pageText = await page.textContent('body');`,
        `expect(pageText?.trim().length ?? 0).toBeGreaterThan(0);`
      );
    }

    return assertions;
  }

  /**
   * Generate assertions for observed bugs.
   */
  private generateObservedBugAssertions(finding: Finding): string[] {
    const assertions: string[] = [];
    const description = finding.description.toLowerCase();

    // Check for error messages in dropdowns or text
    if (
      description.includes('error') &&
      (description.includes('dropdown') || description.includes('select'))
    ) {
      const errorPatterns = [
        /Error\s*\d+:?\s*[^'".]*/gi,
        /Translation error/gi,
        /Subject not found/gi,
      ];

      assertions.push(`// Check dropdown does not contain error messages`);
      assertions.push(`const selectElements = await page.locator('select').all();`);
      assertions.push(`for (const select of selectElements) {`);
      assertions.push(`  const options = await select.locator('option').allTextContents();`);
      assertions.push(`  for (const optionText of options) {`);

      for (const pattern of errorPatterns) {
        const patternStr = pattern.source;
        assertions.push(`    expect(optionText).not.toMatch(/${patternStr}/i);`);
      }

      assertions.push(`  }`);
      assertions.push(`}`);
    }

    // Check for undefined/null values
    if (description.includes('undefined') || description.includes('null')) {
      assertions.push(
        `// Check page does not display undefined or null values`,
        `const pageContent = await page.content();`,
        `expect(pageContent).not.toContain('undefined');`,
        `expect(pageContent).not.toContain('UNDEFINED');`,
        `expect(pageContent.toLowerCase()).not.toMatch(/\\bnull\\b/);`
      );
    }

    // Check for hidden elements with issues
    if (description.includes('hidden')) {
      assertions.push(
        `// Check for problematic hidden elements`,
        `const hiddenElements = await page.locator('[hidden], [style*="display: none"]').all();`,
        `for (const el of hiddenElements) {`,
        `  const text = await el.textContent();`,
        `  if (text) {`,
        `    expect(text).not.toContain('UNDEFINED');`,
        `    expect(text).not.toContain('Error');`,
        `  }`,
        `}`
      );
    }

    if (assertions.length === 0) {
      assertions.push(...this.generateGenericAssertions(finding));
    }

    return assertions;
  }

  /**
   * Generate assertions for UI issues.
   */
  private generateUIIssueAssertions(_finding: Finding): string[] {
    return [
      `// Verify page renders correctly`,
      `await expect(page).toHaveTitle(/.+/);`,
      `const body = page.locator('body');`,
      `await expect(body).toBeVisible();`,
    ];
  }

  /**
   * Generate assertions for console errors.
   * Filters out expected/whitelisted errors (401, 404, favicon, etc.)
   */
  private generateConsoleErrorAssertions(_finding: Finding): string[] {
    const ignorePatterns = (this.config.ignoreConsoleErrors ?? [])
      .map(pattern => `!e.toLowerCase().includes('${pattern.toLowerCase()}')`)
      .join(' && ');

    return [
      `// Check for console errors (excluding expected ones like 404, 401, favicon)`,
      `const consoleErrors: string[] = [];`,
      `page.on('console', msg => {`,
      `  if (msg.type() === 'error') {`,
      `    consoleErrors.push(msg.text());`,
      `  }`,
      `});`,
      `await page.reload();`,
      `await page.waitForLoadState('networkidle');`,
      `// Filter out known/acceptable errors`,
      `const criticalErrors = consoleErrors.filter(e => ${ignorePatterns});`,
      `// Fail if there are unexpected critical errors`,
      `expect(criticalErrors, 'Page should not have unexpected console errors').toHaveLength(0);`,
    ];
  }

  /**
   * Generate assertions for functional issues.
   */
  private generateFunctionalAssertions(finding: Finding): string[] {
    return this.generateGenericAssertions(finding);
  }

  /**
   * Generate assertions for accessibility issues.
   * Uses soft assertions (log warnings) rather than hard failures.
   */
  private generateAccessibilityAssertions(_finding: Finding): string[] {
    return [
      `// Accessibility checks (fail on missing alt text or unlabeled buttons)`,
      `const images = await page.locator('img').all();`,
      `let missingAltCount = 0;`,
      `for (const img of images) {`,
      `  const alt = await img.getAttribute('alt');`,
      `  const src = await img.getAttribute('src');`,
      `  if (!alt && src && !src.includes('data:')) {`,
      `    missingAltCount++;`,
      `  }`,
      `}`,
      `expect(missingAltCount, 'Images should have alt text').toBe(0);`,
      ``,
      `const buttons = await page.locator('button').all();`,
      `let inaccessibleButtonCount = 0;`,
      `for (const button of buttons) {`,
      `  const text = await button.textContent();`,
      `  const ariaLabel = await button.getAttribute('aria-label');`,
      `  if (!text?.trim() && !ariaLabel) {`,
      `    inaccessibleButtonCount++;`,
      `  }`,
      `}`,
      `expect(inaccessibleButtonCount, 'Buttons should have accessible labels').toBe(0);`,
    ];
  }

  /**
   * Generate generic assertions.
   */
  private generateGenericAssertions(_finding: Finding): string[] {
    const assertions: string[] = [];

    // Always check for undefined text
    assertions.push(
      `// Generic assertions based on finding`,
      `const pageContent = await page.content();`,
      ``,
      `// Check for common error indicators`,
      `expect(pageContent).not.toContain('undefined');`,
      `expect(pageContent).not.toContain('UNDEFINED');`,
      `expect(pageContent.toLowerCase()).not.toMatch(/error\\s*\\d+:/i);`
    );

    return assertions;
  }

  /**
   * Sanitize test name for use in describe/test blocks.
   */
  private sanitizeTestName(title: string): string {
    // Remove special characters and truncate
    return title
      .replace(/['"\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);
  }

  /**
   * Generate the complete test file content.
   */
  private generateTestFileContent(testCases: TestCase[], sessionId: string): string {
    const lines: string[] = [];

    // Header and imports
    lines.push(`/**`);
    lines.push(` * Auto-generated regression tests from AI Exploratory Agent`);
    lines.push(` * Session ID: ${sessionId}`);
    lines.push(` * Generated: ${new Date().toISOString()}`);
    lines.push(` * `);
    lines.push(` * These tests verify that bugs discovered during exploration are reproducible.`);
    lines.push(` * Run with: npx playwright test ${this.config.filePrefix}*.spec.ts`);
    lines.push(` */`);
    lines.push(``);
    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push(``);
    lines.push(
      `test.describe('Bug Regression Tests - Session ${sessionId.substring(0, 8)}', () => {`
    );
    lines.push(`  test.beforeEach(async ({ page }) => {`);
    lines.push(`    // Set default timeout`);
    lines.push(`    test.setTimeout(${this.config.testTimeout});`);
    lines.push(`  });`);
    lines.push(``);

    if (this.config.groupByPage) {
      // Group test cases by page URL
      const byPage = this.groupTestsByPage(testCases);

      for (const [pageUrl, cases] of Object.entries(byPage)) {
        const pageName = this.getPageNameFromUrl(pageUrl);
        lines.push(`  test.describe('${pageName}', () => {`);

        for (const testCase of cases) {
          lines.push(...this.generateSingleTest(testCase, pageUrl, '    '));
          lines.push(``);
        }

        lines.push(`  });`);
        lines.push(``);
      }
    } else {
      // Flat list of tests
      for (const testCase of testCases) {
        lines.push(...this.generateSingleTest(testCase, testCase.pageUrl, '  '));
        lines.push(``);
      }
    }

    lines.push(`});`);

    return lines.join('\n');
  }

  /**
   * Group test cases by page URL.
   */
  private groupTestsByPage(testCases: TestCase[]): Record<string, TestCase[]> {
    const grouped: Record<string, TestCase[]> = {};

    for (const testCase of testCases) {
      const url = testCase.pageUrl;
      if (!grouped[url]) {
        grouped[url] = [];
      }
      grouped[url].push(testCase);
    }

    return grouped;
  }

  /**
   * Get a readable page name from URL.
   */
  private getPageNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash.replace('#/', '').replace(/\//g, ' > ') || 'Home';
      return hash.charAt(0).toUpperCase() + hash.slice(1);
    } catch {
      return 'Page';
    }
  }

  /**
   * Generate a single test case.
   */
  private generateSingleTest(testCase: TestCase, pageUrl: string, indent: string): string[] {
    const lines: string[] = [];

    // Include short finding ID to ensure unique test names
    const shortId = testCase.findingId.substring(0, 8);
    lines.push(
      `${indent}test('[${testCase.severity.toUpperCase()}] ${testCase.name} (${shortId})', async ({ page }) => {`
    );
    lines.push(`${indent}  // Finding ID: ${testCase.findingId}`);
    lines.push(`${indent}  // Type: ${testCase.findingType}`);
    lines.push(
      `${indent}  // Description: ${testCase.description.replace(/\n/g, ' ').substring(0, 100)}`
    );
    lines.push(`${indent}  `);
    lines.push(`${indent}  // Navigate to the page`);
    lines.push(`${indent}  await page.goto('${pageUrl}');`);
    lines.push(`${indent}  await page.waitForLoadState('networkidle');`);
    lines.push(`${indent}  `);

    // Add assertions with proper indentation
    for (const assertion of testCase.assertions) {
      lines.push(`${indent}  ${assertion}`);
    }

    lines.push(`${indent}});`);

    return lines;
  }

  /**
   * Get the output directory path.
   */
  getOutputDir(): string {
    return this.config.outputDir;
  }
}
