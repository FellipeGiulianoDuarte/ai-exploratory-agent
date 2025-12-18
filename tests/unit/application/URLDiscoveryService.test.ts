import { URLDiscoveryService } from '../../../src/application/services/URLDiscoveryService';
import { BrowserPort } from '../../../src/application/ports/BrowserPort';

// Mock BrowserPort
const createMockBrowser = (): BrowserPort => ({
  initialize: jest.fn(),
  navigate: jest.fn(),
  click: jest.fn(),
  fill: jest.fn(),
  select: jest.fn(),
  hover: jest.fn(),
  screenshot: jest.fn(),
  extractPageState: jest.fn(),
  getInteractiveElements: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  isReady: jest.fn(),
  getCurrentUrl: jest.fn(),
  getTitle: jest.fn(),
  goBack: jest.fn(),
  refresh: jest.fn(),
  close: jest.fn(),
});

describe('URLDiscoveryService - Priority System', () => {
  let service: URLDiscoveryService;
  let mockBrowser: BrowserPort;

  beforeEach(() => {
    service = new URLDiscoveryService({
      sameOriginOnly: true,
      excludePatterns: [],
      priorityPatterns: [],
      maxQueueSize: 100,
    });
    mockBrowser = createMockBrowser();
  });

  describe('Priority Score Assignment', () => {
    it('should assign score 5 to signup pages (highest priority)', async () => {
      service.setBaseUrl('https://example.com');

      // Mock browser to return signup link
      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/signup', text: 'Sign Up' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered).toHaveLength(1);
      expect(discovered[0].priorityScore).toBe(5);
      expect(discovered[0].priority).toBe('high');
    });

    it('should assign score 5 to register pages', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/register', text: 'Register' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(5);
      expect(discovered[0].priority).toBe('high');
    });

    it('should assign score 15 to login pages', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/login', text: 'Login' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(15);
      expect(discovered[0].priority).toBe('high');
    });

    it('should assign score 15 to signin pages', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/signin', text: 'Sign In' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(15);
    });

    it('should assign score 25 to home page (root URL)', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/', text: 'Home' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com/products');

      expect(discovered[0].priorityScore).toBe(25);
      expect(discovered[0].priority).toBe('high');
    });

    it('should assign score 65 to contact page', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/contact', text: 'Contact Us' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(65);
      expect(discovered[0].priority).toBe('medium');
    });

    it('should assign score 75 to about page', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/about', text: 'About' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(75);
      expect(discovered[0].priority).toBe('low');
    });

    it('should assign score 35 to product pages', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/products', text: 'Products' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(35);
      expect(discovered[0].priority).toBe('medium');
    });

    it('should assign score 40 to cart pages', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/cart', text: 'Cart' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(40);
      expect(discovered[0].priority).toBe('medium');
    });

    it('should assign score 50 to uncategorized pages (default)', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValue([
        { href: 'https://example.com/some-random-page', text: 'Random' },
      ]);

      const discovered = await service.scanPage(mockBrowser, 'https://example.com');

      expect(discovered[0].priorityScore).toBe(50);
      expect(discovered[0].priority).toBe('medium');
    });
  });

  describe('URL Sorting Order', () => {
    it('should sort URLs by priority: signup > login > home > contact > about', async () => {
      service.setBaseUrl('https://example.com');

      // Simulate discovering URLs in random order
      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/about', text: 'About' },
        { href: 'https://example.com/contact', text: 'Contact' },
        { href: 'https://example.com/', text: 'Home' },
        { href: 'https://example.com/login', text: 'Login' },
        { href: 'https://example.com/signup', text: 'Sign Up' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com/products');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited).toHaveLength(5);

      // Verify order: signup (5) > login (15) > home (25) > contact (65) > about (75)
      expect(unvisited[0].normalizedUrl).toContain('/signup');
      expect(unvisited[0].priorityScore).toBe(5);

      expect(unvisited[1].normalizedUrl).toContain('/login');
      expect(unvisited[1].priorityScore).toBe(15);

      expect(unvisited[2].normalizedUrl).toBe('https://example.com/');
      expect(unvisited[2].priorityScore).toBe(25);

      expect(unvisited[3].normalizedUrl).toContain('/contact');
      expect(unvisited[3].priorityScore).toBe(65);

      expect(unvisited[4].normalizedUrl).toContain('/about');
      expect(unvisited[4].priorityScore).toBe(75);
    });

    it('should sort URLs with same priority by discovery time', async () => {
      service.setBaseUrl('https://example.com');

      // First scan - discover first product
      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/products/first', text: 'First Product' },
      ]);
      await service.scanPage(mockBrowser, 'https://example.com');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second scan - discover second product
      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/products/second', text: 'Second Product' },
      ]);
      await service.scanPage(mockBrowser, 'https://example.com/other');

      const unvisited = service.getUnvisitedURLs();

      // Both have score 35, but first should come before second
      expect(unvisited[0].normalizedUrl).toContain('/first');
      expect(unvisited[1].normalizedUrl).toContain('/second');
    });

    it('should handle complex priority ordering with many URLs', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/blog', text: 'Blog' }, // 85
        { href: 'https://example.com/faq', text: 'FAQ' }, // 80
        { href: 'https://example.com/about', text: 'About' }, // 75
        { href: 'https://example.com/contact', text: 'Contact' }, // 65
        { href: 'https://example.com/random', text: 'Random' }, // 50
        { href: 'https://example.com/profile', text: 'Profile' }, // 45
        { href: 'https://example.com/cart', text: 'Cart' }, // 40
        { href: 'https://example.com/products', text: 'Products' }, // 35
        { href: 'https://example.com/', text: 'Home' }, // 25
        { href: 'https://example.com/login', text: 'Login' }, // 15
        { href: 'https://example.com/signup', text: 'Sign Up' }, // 5
      ]);

      await service.scanPage(mockBrowser, 'https://example.com/start');

      const unvisited = service.getUnvisitedURLs();

      // Verify priority scores are in ascending order (lower = higher priority)
      for (let i = 0; i < unvisited.length - 1; i++) {
        expect(unvisited[i].priorityScore).toBeLessThanOrEqual(unvisited[i + 1].priorityScore);
      }

      // Verify specific ordering for key pages
      expect(unvisited[0].normalizedUrl).toContain('/signup'); // 5
      expect(unvisited[1].normalizedUrl).toContain('/login'); // 15
      expect(unvisited[2].normalizedUrl).toBe('https://example.com/'); // 25

      // Contact should come before About
      const contactIndex = unvisited.findIndex(u => u.normalizedUrl.includes('/contact'));
      const aboutIndex = unvisited.findIndex(u => u.normalizedUrl.includes('/about'));
      expect(contactIndex).toBeLessThan(aboutIndex);
    });
  });

  describe('Priority with Visited URLs', () => {
    it('should exclude visited URLs from unvisited list', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/signup', text: 'Sign Up' },
        { href: 'https://example.com/login', text: 'Login' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com');

      // Mark signup as visited
      service.markVisited('https://example.com/signup');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited).toHaveLength(1);
      expect(unvisited[0].normalizedUrl).toContain('/login');
    });

    it('should maintain correct ordering after marking URLs as visited', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/signup', text: 'Sign Up' },
        { href: 'https://example.com/login', text: 'Login' },
        { href: 'https://example.com/contact', text: 'Contact' },
        { href: 'https://example.com/about', text: 'About' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com');

      // Visit signup and contact
      service.markVisited('https://example.com/signup');
      service.markVisited('https://example.com/contact');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited).toHaveLength(2);
      expect(unvisited[0].normalizedUrl).toContain('/login'); // Priority 15
      expect(unvisited[1].normalizedUrl).toContain('/about'); // Priority 75
    });
  });

  describe('Special Cases', () => {
    it('should handle SPA hash routes for home page', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/#/', text: 'Home' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com/page');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited[0].priorityScore).toBe(25); // Home page priority
    });

    it('should handle sign-up with hyphen', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/sign-up', text: 'Sign Up' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited[0].priorityScore).toBe(5);
    });

    it('should handle sign-in with hyphen', async () => {
      service.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/sign-in', text: 'Sign In' },
      ]);

      await service.scanPage(mockBrowser, 'https://example.com');

      const unvisited = service.getUnvisitedURLs();

      expect(unvisited[0].priorityScore).toBe(15);
    });

    it('should prioritize custom patterns', async () => {
      const customService = new URLDiscoveryService({
        sameOriginOnly: true,
        excludePatterns: [],
        priorityPatterns: ['/special'],
        maxQueueSize: 100,
      });

      customService.setBaseUrl('https://example.com');

      (mockBrowser.evaluate as jest.Mock).mockResolvedValueOnce([
        { href: 'https://example.com/special', text: 'Special' },
        { href: 'https://example.com/about', text: 'About' },
      ]);

      await customService.scanPage(mockBrowser, 'https://example.com');

      const unvisited = customService.getUnvisitedURLs();

      expect(unvisited[0].normalizedUrl).toContain('/special');
      expect(unvisited[0].priorityScore).toBe(30); // Custom priority
    });
  });
});
