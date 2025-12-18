/**
 * Integration tests for all HIGH priority tools.
 * These tests verify that tools work correctly with actual browser interactions.
 */

import { PlaywrightBrowserAdapter } from '../../src/infrastructure/browser/PlaywrightBrowserAdapter';
import { ConsoleErrorAnalyzerTool } from '../../src/infrastructure/tools/ConsoleErrorAnalyzerTool';
import { NetworkErrorAnalyzerTool } from '../../src/infrastructure/tools/NetworkErrorAnalyzerTool';
import { ScreenshotCaptureTool } from '../../src/infrastructure/tools/ScreenshotCaptureTool';
import { PageContentAnalyzerTool } from '../../src/infrastructure/tools/PageContentAnalyzerTool';
import { DropdownValidatorTool } from '../../src/infrastructure/tools/DropdownValidatorTool';
import { BrokenImageDetectorTool } from '../../src/infrastructure/tools/BrokenImageDetectorTool';
import { ToolContext } from '../../src/domain/tools/Tool';

describe('Tools Integration Tests', () => {
  let browser: PlaywrightBrowserAdapter;
  let context: ToolContext;

  beforeAll(async () => {
    browser = new PlaywrightBrowserAdapter({ headless: true });
    await browser.initialize();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    context = {
      browser,
      currentUrl: '',
    };
  });

  describe('ConsoleErrorAnalyzerTool', () => {
    it('should analyze console errors on a page', async () => {
      const tool = new ConsoleErrorAnalyzerTool();

      // Navigate to a page
      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.pageUrl).toContain('example.com');
      expect(result.data?.totalErrors).toBeGreaterThanOrEqual(0);
      expect(result.data?.summary).toBeDefined();
    });
  });

  describe('NetworkErrorAnalyzerTool', () => {
    it('should analyze network errors on a page', async () => {
      const tool = new NetworkErrorAnalyzerTool();

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.totalErrors).toBeGreaterThanOrEqual(0);
      expect(result.data?.summary).toBeDefined();
    });
  });

  describe('ScreenshotCaptureTool', () => {
    it('should capture a screenshot', async () => {
      const tool = new ScreenshotCaptureTool();

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({ description: 'test-screenshot' }, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.filepath).toBeDefined();
      expect(result.data?.summary).toContain('Screenshot captured');
    });
  });

  describe('PageContentAnalyzerTool', () => {
    it('should analyze page content for issues', async () => {
      const tool = new PageContentAnalyzerTool();

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.totalIssues).toBeGreaterThanOrEqual(0);
      expect(result.data?.summary).toBeDefined();
    });
  });

  describe('DropdownValidatorTool', () => {
    it('should validate dropdowns on a page', async () => {
      const tool = new DropdownValidatorTool();

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.totalDropdowns).toBeGreaterThanOrEqual(0);
      expect(result.data?.summary).toBeDefined();
    });
  });

  describe('BrokenImageDetectorTool', () => {
    it('should detect broken images', async () => {
      const tool = new BrokenImageDetectorTool();

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      const result = await tool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.totalImages).toBeGreaterThanOrEqual(0);
    });
  });

  describe('All Tools Together', () => {
    it('should run all tools on the same page successfully', async () => {
      const tools = [
        new ConsoleErrorAnalyzerTool(),
        new NetworkErrorAnalyzerTool(),
        new PageContentAnalyzerTool(),
        new DropdownValidatorTool(),
        new BrokenImageDetectorTool(),
        new ScreenshotCaptureTool(),
      ];

      await browser.navigate('https://example.com');
      context.currentUrl = 'https://example.com';

      for (const tool of tools) {
        const result = await tool.execute({}, context);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      }
    });
  });
});
