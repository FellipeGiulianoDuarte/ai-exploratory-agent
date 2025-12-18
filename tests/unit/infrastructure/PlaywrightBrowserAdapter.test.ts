import { PlaywrightBrowserAdapter } from '../../../src/infrastructure/browser/PlaywrightBrowserAdapter';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

describe('PlaywrightBrowserAdapter', () => {
  let adapter: PlaywrightBrowserAdapter;
  let mockBrowser: jest.Mocked<Browser>;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock page
    mockPage = {
      setDefaultTimeout: jest.fn(),
      on: jest.fn(),
      goto: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page'),
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      selectOption: jest.fn().mockResolvedValue(undefined),
      hover: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
      evaluate: jest.fn().mockResolvedValue(''),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      goBack: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Page>;

    // Create mock context
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BrowserContext>;

    // Create mock browser
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Browser>;

    // Setup chromium.launch mock
    (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);

    adapter = new PlaywrightBrowserAdapter({
      headless: true,
      timeout: 5000,
      screenshotDir: './test-screenshots',
      maxRetries: 2,
      retryBaseDelay: 100,
    });
  });

  describe('initialize', () => {
    it('should initialize browser, context, and page', async () => {
      await adapter.initialize();

      expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(5000);
    });

    it('should set up console and network error listeners', async () => {
      await adapter.initialize();

      expect(mockPage.on).toHaveBeenCalledWith('console', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('requestfailed', expect.any(Function));
    });
  });

  describe('isReady', () => {
    it('should return false before initialization', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await adapter.initialize();
      expect(adapter.isReady()).toBe(true);
    });
  });

  describe('navigate', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should navigate to URL successfully', async () => {
      const result = await adapter.navigate('https://example.com');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should use provided navigation options', async () => {
      await adapter.navigate('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 10000,
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 10000,
      });
    });

    it('should retry on failure', async () => {
      mockPage.goto
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(null);

      const result = await adapter.navigate('https://example.com');

      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledTimes(2);
    });

    it('should return error after max retries', async () => {
      mockPage.goto.mockRejectedValue(new Error('Network error'));

      const result = await adapter.navigate('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('click', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should click element successfully', async () => {
      const result = await adapter.click('#button');

      expect(result.success).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('#button', expect.any(Object));
    });

    it('should pass click options', async () => {
      await adapter.click('#button', { delay: 100, force: true });

      expect(mockPage.click).toHaveBeenCalledWith('#button', expect.objectContaining({
        delay: 100,
        force: true,
      }));
    });
  });

  describe('fill', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should fill input field successfully', async () => {
      const result = await adapter.fill('#input', 'test value');

      expect(result.success).toBe(true);
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test value', expect.any(Object));
    });

    it('should clear field before filling when option is set', async () => {
      await adapter.fill('#input', 'test value', { clear: true });

      expect(mockPage.fill).toHaveBeenCalledTimes(2);
      expect(mockPage.fill).toHaveBeenNthCalledWith(1, '#input', '');
    });
  });

  describe('select', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should select option successfully', async () => {
      const result = await adapter.select('#dropdown', 'option1');

      expect(result.success).toBe(true);
      expect(mockPage.selectOption).toHaveBeenCalledWith('#dropdown', 'option1');
    });
  });

  describe('hover', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should hover over element successfully', async () => {
      const result = await adapter.hover('#element');

      expect(result.success).toBe(true);
      expect(mockPage.hover).toHaveBeenCalledWith('#element');
    });
  });

  describe('screenshot', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should take screenshot and return path', async () => {
      const path = await adapter.screenshot({ path: 'test.png' });

      expect(path).toContain('test.png');
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it('should use fullPage option', async () => {
      await adapter.screenshot({ fullPage: true });

      expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({
        fullPage: true,
      }));
    });
  });

  describe('extractPageState', () => {
    beforeEach(async () => {
      await adapter.initialize();
      mockPage.url.mockReturnValue('https://example.com/page');
      mockPage.title.mockResolvedValue('Page Title');
      // extractPageState calls evaluate from multiple places in parallel:
      // 1. For visibleText (in extractPageState)
      // 2. For interactive elements (in getInteractiveElements)
      // Since they run in parallel via Promise.all, we use mockResolvedValue
      // to return the same value for all calls
      mockPage.evaluate.mockImplementation(() => {
        // Return array for interactive elements evaluation (contains 'querySelectorAll')
        // Return string for visibleText evaluation
        return Promise.resolve([]);
      });
    });

    it('should extract page state', async () => {
      // Override evaluate to return appropriate values
      mockPage.evaluate
        .mockResolvedValueOnce([]) // interactive elements (called first in Promise.all sequence)
        .mockResolvedValueOnce('Page content'); // visibleText
        
      const state = await adapter.extractPageState();

      expect(state.url).toBe('https://example.com/page');
      expect(state.title).toBe('Page Title');
      expect(state.timestamp).toBeInstanceOf(Date);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('getInteractiveElements', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return interactive elements', async () => {
      mockPage.evaluate.mockResolvedValue([
        {
          selector: '#button1',
          type: 'button',
          text: 'Click Me',
          tagName: 'button',
          attributes: { id: 'button1' },
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
          isVisible: true,
          isEnabled: true,
        },
      ]);

      const elements = await adapter.getInteractiveElements();

      expect(elements.length).toBe(1);
      expect(elements[0].selector).toBe('#button1');
      expect(elements[0].type).toBe('button');
    });
  });

  describe('waitForSelector', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should wait for selector successfully', async () => {
      const result = await adapter.waitForSelector('#element');

      expect(result.success).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#element', expect.any(Object));
    });
  });

  describe('getCurrentUrl', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return current URL', async () => {
      mockPage.url.mockReturnValue('https://example.com/current');

      const url = await adapter.getCurrentUrl();

      expect(url).toBe('https://example.com/current');
    });
  });

  describe('getTitle', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return page title', async () => {
      mockPage.title.mockResolvedValue('Current Title');

      const title = await adapter.getTitle();

      expect(title).toBe('Current Title');
    });
  });

  describe('goBack', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should go back in history', async () => {
      const result = await adapter.goBack();

      expect(result.success).toBe(true);
      expect(mockPage.goBack).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should refresh page', async () => {
      const result = await adapter.refresh();

      expect(result.success).toBe(true);
      expect(mockPage.reload).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close browser resources', async () => {
      await adapter.initialize();
      await adapter.close();

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw when page not initialized', async () => {
      await expect(adapter.navigate('https://example.com')).rejects.toThrow(
        'Browser not initialized'
      );
    });
  });
});
