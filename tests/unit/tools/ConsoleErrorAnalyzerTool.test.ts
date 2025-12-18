import { ConsoleErrorAnalyzerTool } from '../../../src/infrastructure/tools/ConsoleErrorAnalyzerTool';
import { ToolContext } from '../../../src/domain/tools/Tool';
import { BrowserPort } from '../../../src/application/ports/BrowserPort';
import { PageState } from '../../../src/domain/browser/PageState';

describe('ConsoleErrorAnalyzerTool', () => {
  let tool: ConsoleErrorAnalyzerTool;
  let mockBrowser: jest.Mocked<BrowserPort>;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new ConsoleErrorAnalyzerTool();

    mockBrowser = {
      getCurrentUrl: jest.fn().mockResolvedValue('https://example.com/page'),
      getTitle: jest.fn().mockResolvedValue('Test Page'),
      extractPageState: jest.fn(),
    } as any;

    mockContext = {
      browser: mockBrowser,
      currentUrl: 'https://example.com/page',
    };
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('analyze_console_errors');
    expect(tool.description).toContain('console errors');
  });

  it('should report no errors when console is clean', async () => {
    mockBrowser.extractPageState.mockResolvedValue(
      PageState.create({
        url: 'https://example.com',
        title: 'Test',
        contentHash: 'hash',
        timestamp: new Date(),
        interactiveElements: [],
        visibleText: '',
        isLoading: false,
        consoleErrors: [],
        networkErrors: [],
        viewport: { width: 1920, height: 1080 },
      })
    );

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.totalErrors).toBe(0);
    expect(result.data?.summary).toContain('No console errors');
  });

  it('should detect and categorize critical errors', async () => {
    mockBrowser.extractPageState.mockResolvedValue(
      PageState.create({
        url: 'https://example.com',
        title: 'Test',
        contentHash: 'hash',
        timestamp: new Date(),
        interactiveElements: [],
        visibleText: '',
        isLoading: false,
        consoleErrors: [
          'Unhandled exception: Cannot read property of undefined',
          'Security error: Access denied',
        ],
        networkErrors: [],
        viewport: { width: 1920, height: 1080 },
      })
    );

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.totalErrors).toBe(2);
    expect(result.data?.errorsBySeverity.critical).toBeGreaterThan(0);
  });

  it('should detect high severity errors', async () => {
    mockBrowser.extractPageState.mockResolvedValue(
      PageState.create({
        url: 'https://example.com',
        title: 'Test',
        contentHash: 'hash',
        timestamp: new Date(),
        interactiveElements: [],
        visibleText: '',
        isLoading: false,
        consoleErrors: [
          'Error: Failed to fetch data',
          'TypeError: Cannot read property "name" of undefined',
        ],
        networkErrors: [],
        viewport: { width: 1920, height: 1080 },
      })
    );

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.totalErrors).toBe(2);
    expect(result.data?.errorsBySeverity.high).toBeGreaterThan(0);
    expect(result.data?.categorizedErrors.length).toBeGreaterThan(0);
  });

  it('should categorize errors by type', async () => {
    mockBrowser.extractPageState.mockResolvedValue(
      PageState.create({
        url: 'https://example.com',
        title: 'Test',
        contentHash: 'hash',
        timestamp: new Date(),
        interactiveElements: [],
        visibleText: '',
        isLoading: false,
        consoleErrors: [
          'CORS error: Access-Control-Allow-Origin',
          'Network error: Failed to fetch',
          'Warning: Deprecated API usage',
        ],
        networkErrors: [],
        viewport: { width: 1920, height: 1080 },
      })
    );

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const categories = result.data?.categorizedErrors.map(e => e.category);
    expect(categories).toContain('CORS Error');
    expect(categories).toContain('Network Error');
  });
});
