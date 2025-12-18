import { BrokenImageDetectorTool } from '../../../src/infrastructure/tools/BrokenImageDetectorTool';
import { ToolContext } from '../../../src/domain/tools/Tool';
import { BrowserPort } from '../../../src/application/ports/BrowserPort';

describe('BrokenImageDetectorTool', () => {
  let tool: BrokenImageDetectorTool;
  let mockBrowser: jest.Mocked<BrowserPort>;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new BrokenImageDetectorTool();

    mockBrowser = {
      getCurrentUrl: jest.fn().mockResolvedValue('https://example.com/page'),
      getTitle: jest.fn().mockResolvedValue('Test Page'),
      evaluate: jest.fn(),
      // Add other required methods as needed
      initialize: jest.fn(),
      close: jest.fn(),
      isReady: jest.fn(),
      navigate: jest.fn(),
      click: jest.fn(),
      fill: jest.fn(),
      select: jest.fn(),
      hover: jest.fn(),
      screenshot: jest.fn(),
      extractPageState: jest.fn(),
      getInteractiveElements: jest.fn(),
      waitForSelector: jest.fn(),
      goBack: jest.fn(),
      refresh: jest.fn(),
    } as jest.Mocked<BrowserPort>;

    mockContext = {
      browser: mockBrowser,
      currentUrl: 'https://example.com/page',
    };
  });

  describe('getDefinition', () => {
    it('should return correct tool definition', () => {
      const definition = tool.getDefinition();

      expect(definition.name).toBe('find_broken_images');
      expect(definition.description).toContain('broken images');
      expect(definition.parameters).toHaveProperty('timeout');
      expect(definition.parameters).toHaveProperty('checkHttpStatus');
    });
  });

  describe('execute', () => {
    it('should detect empty src attributes', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: '',
          alt: 'Missing image',
          selector: 'img:nth-of-type(1)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 100,
          y: 200,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.brokenCount).toBe(1);
      expect(result.data!.brokenImages[0].reason).toBe('empty_src');
    });

    it('should detect zero-dimension images', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: 'https://example.com/image.jpg',
          alt: 'Broken image',
          selector: '#broken-img',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: 'https://example.com/image.jpg',
          x: 100,
          y: 200,
        },
      ]);

      const result = await tool.execute({ checkHttpStatus: false }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.brokenCount).toBe(1);
      expect(result.data!.brokenImages[0].reason).toBe('zero_dimensions');
    });

    it('should detect images that have not completed loading', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: 'https://example.com/slow-image.jpg',
          alt: 'Slow loading',
          selector: 'img.slow',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: false,
          currentSrc: 'https://example.com/slow-image.jpg',
          x: 100,
          y: 200,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.brokenCount).toBe(1);
      expect(result.data!.brokenImages[0].reason).toBe('load_timeout');
    });

    it('should handle valid images correctly', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: 'https://example.com/valid-image.jpg',
          alt: 'Valid image',
          selector: 'img.valid',
          naturalWidth: 800,
          naturalHeight: 600,
          complete: true,
          currentSrc: 'https://example.com/valid-image.jpg',
          x: 100,
          y: 200,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.totalImages).toBe(1);
      expect(result.data!.brokenCount).toBe(0);
      expect(result.data!.brokenImages).toHaveLength(0);
    });

    it('should handle data URLs correctly', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          alt: 'Data URL image',
          selector: 'img.data',
          naturalWidth: 1,
          naturalHeight: 1,
          complete: true,
          currentSrc: 'data:image/png;base64,...',
          x: 0,
          y: 0,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.brokenCount).toBe(0);
    });

    it('should detect invalid src attributes', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: 'invalid://not-a-valid-url',
          alt: 'Invalid URL',
          selector: 'img.invalid',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 100,
          y: 200,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.brokenCount).toBe(1);
      expect(result.data!.brokenImages[0].reason).toBe('invalid_src');
    });

    it('should handle pages with no images', async () => {
      mockBrowser.evaluate.mockResolvedValue([]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.totalImages).toBe(0);
      expect(result.data!.brokenCount).toBe(0);
    });

    it('should return report with page context', async () => {
      mockBrowser.evaluate.mockResolvedValue([]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.pageUrl).toBe('https://example.com/page');
      expect(result.data!.pageTitle).toBe('Test Page');
      expect(result.data!.timestamp).toBeInstanceOf(Date);
    });

    it('should include scan duration', async () => {
      mockBrowser.evaluate.mockResolvedValue([]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.scanDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple broken images', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: '',
          alt: 'Empty src',
          selector: 'img:nth-of-type(1)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 0,
          y: 0,
        },
        {
          src: 'https://example.com/broken.jpg',
          alt: 'Zero dimensions',
          selector: 'img:nth-of-type(2)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: 'https://example.com/broken.jpg',
          x: 100,
          y: 100,
        },
        {
          src: 'https://example.com/valid.jpg',
          alt: 'Valid',
          selector: 'img:nth-of-type(3)',
          naturalWidth: 100,
          naturalHeight: 100,
          complete: true,
          currentSrc: 'https://example.com/valid.jpg',
          x: 200,
          y: 200,
        },
      ]);

      const result = await tool.execute({ checkHttpStatus: false }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data!.totalImages).toBe(3);
      expect(result.data!.brokenCount).toBe(2);
    });
  });

  describe('BrokenImageReport', () => {
    it('should summarize correctly', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: '',
          alt: 'Test',
          selector: 'img',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 0,
          y: 0,
        },
      ]);

      const result = await tool.execute({}, mockContext);

      expect(result.success).toBe(true);
      const summary = result.data!.summarize();
      expect(summary).toContain('Broken Image Report');
      expect(summary).toContain('example.com');
    });

    it('should group by reason', async () => {
      mockBrowser.evaluate.mockResolvedValue([
        {
          src: '',
          alt: 'Empty 1',
          selector: 'img:nth-of-type(1)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 0,
          y: 0,
        },
        {
          src: '',
          alt: 'Empty 2',
          selector: 'img:nth-of-type(2)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: '',
          x: 0,
          y: 0,
        },
        {
          src: 'https://example.com/test.jpg',
          alt: 'Zero dim',
          selector: 'img:nth-of-type(3)',
          naturalWidth: 0,
          naturalHeight: 0,
          complete: true,
          currentSrc: 'https://example.com/test.jpg',
          x: 0,
          y: 0,
        },
      ]);

      const result = await tool.execute({ checkHttpStatus: false }, mockContext);

      expect(result.success).toBe(true);
      const byReason = result.data!.getByReason();
      expect(byReason.get('empty_src')).toHaveLength(2);
      expect(byReason.get('zero_dimensions')).toHaveLength(1);
    });
  });
});
