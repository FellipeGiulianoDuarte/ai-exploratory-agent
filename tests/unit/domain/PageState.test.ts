import { PageState, PageStateProps } from '../../../src/domain/browser/PageState';
import { InteractiveElement, ElementType } from '../../../src/domain/browser/InteractiveElement';

describe('PageState', () => {
  const createMockElement = (type: ElementType, selector: string): InteractiveElement => {
    return InteractiveElement.create({
      selector,
      type,
      text: `Element ${selector}`,
      tagName: 'div',
      attributes: {},
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      isVisible: true,
      isEnabled: true,
    });
  };

  const createDefaultProps = (overrides: Partial<PageStateProps> = {}): PageStateProps => ({
    url: 'https://example.com/page',
    title: 'Test Page',
    contentHash: 'abc123',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    interactiveElements: [
      createMockElement('button', '#btn1'),
      createMockElement('link', '#link1'),
      createMockElement('input', '#input1'),
    ],
    visibleText: 'This is the visible page content.',
    isLoading: false,
    consoleErrors: [],
    networkErrors: [],
    viewport: { width: 1280, height: 720 },
    ...overrides,
  });

  describe('create', () => {
    it('should create a PageState with valid props', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      expect(state.url).toBe('https://example.com/page');
      expect(state.title).toBe('Test Page');
      expect(state.contentHash).toBe('abc123');
      expect(state.isLoading).toBe(false);
    });

    it('should handle empty interactive elements', () => {
      const props = createDefaultProps({ interactiveElements: [] });
      const state = PageState.create(props);

      expect(state.elementCount).toBe(0);
      expect(state.interactiveElements).toEqual([]);
    });
  });

  describe('getters', () => {
    it('should return element count', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      expect(state.elementCount).toBe(3);
    });

    it('should return a copy of interactive elements', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const elements = state.interactiveElements;
      expect(elements.length).toBe(3);
      
      // Modifying returned array should not affect state
      elements.pop();
      expect(state.interactiveElements.length).toBe(3);
    });

    it('should return a copy of console errors', () => {
      const props = createDefaultProps({
        consoleErrors: ['Error 1', 'Error 2'],
      });
      const state = PageState.create(props);

      const errors = state.consoleErrors;
      expect(errors).toEqual(['Error 1', 'Error 2']);
    });

    it('should return a copy of viewport', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const viewport = state.viewport;
      expect(viewport).toEqual({ width: 1280, height: 720 });
    });
  });

  describe('hasErrors', () => {
    it('should return false when no errors', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      expect(state.hasErrors()).toBe(false);
    });

    it('should return true when console errors exist', () => {
      const props = createDefaultProps({
        consoleErrors: ['JavaScript error'],
      });
      const state = PageState.create(props);

      expect(state.hasErrors()).toBe(true);
    });

    it('should return true when network errors exist', () => {
      const props = createDefaultProps({
        networkErrors: ['Failed to fetch resource'],
      });
      const state = PageState.create(props);

      expect(state.hasErrors()).toBe(true);
    });
  });

  describe('getElementsByType', () => {
    it('should filter elements by type', () => {
      const props = createDefaultProps({
        interactiveElements: [
          createMockElement('button', '#btn1'),
          createMockElement('button', '#btn2'),
          createMockElement('link', '#link1'),
          createMockElement('input', '#input1'),
        ],
      });
      const state = PageState.create(props);

      const buttons = state.getElementsByType('button');
      expect(buttons.length).toBe(2);
      
      const links = state.getElementsByType('link');
      expect(links.length).toBe(1);
    });

    it('should return empty array for non-existent type', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const checkboxes = state.getElementsByType('checkbox');
      expect(checkboxes).toEqual([]);
    });
  });

  describe('findElement', () => {
    it('should find element by selector', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const element = state.findElement('#btn1');
      expect(element).toBeDefined();
      expect(element?.selector).toBe('#btn1');
    });

    it('should return undefined for non-existent selector', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const element = state.findElement('#non-existent');
      expect(element).toBeUndefined();
    });
  });

  describe('summarize', () => {
    it('should return a summary string', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const summary = state.summarize();
      expect(summary).toContain('URL: https://example.com/page');
      expect(summary).toContain('Title: Test Page');
      expect(summary).toContain('Elements: 3');
      expect(summary).toContain('Loading: false');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const props = createDefaultProps();
      const state = PageState.create(props);

      const json = state.toJSON();
      expect(json.url).toBe('https://example.com/page');
      expect(json.title).toBe('Test Page');
      expect(json.elementCount).toBe(3);
      expect(typeof json.timestamp).toBe('string');
    });

    it('should truncate visible text in JSON', () => {
      const longText = 'A'.repeat(1000);
      const props = createDefaultProps({ visibleText: longText });
      const state = PageState.create(props);

      const json = state.toJSON();
      expect((json.visibleText as string).length).toBeLessThanOrEqual(500);
    });
  });

  describe('equals', () => {
    it('should return true for equal states', () => {
      const props = createDefaultProps();
      const state1 = PageState.create(props);
      const state2 = PageState.create(props);

      expect(state1.equals(state2)).toBe(true);
    });

    it('should return false for different states', () => {
      const state1 = PageState.create(createDefaultProps({ url: 'https://example.com/page1' }));
      const state2 = PageState.create(createDefaultProps({ url: 'https://example.com/page2' }));

      expect(state1.equals(state2)).toBe(false);
    });
  });
});
