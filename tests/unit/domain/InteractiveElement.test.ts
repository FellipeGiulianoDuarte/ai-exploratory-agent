import { InteractiveElement, ElementType, InteractiveElementProps } from '../../../src/domain/browser/InteractiveElement';

describe('InteractiveElement', () => {
  const createDefaultProps = (overrides: Partial<InteractiveElementProps> = {}): InteractiveElementProps => ({
    selector: '#test-button',
    type: 'button' as ElementType,
    text: 'Click Me',
    tagName: 'button',
    attributes: { id: 'test-button', class: 'btn btn-primary' },
    boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    isVisible: true,
    isEnabled: true,
    ariaLabel: 'Test button',
    placeholder: undefined,
    value: undefined,
    ...overrides,
  });

  describe('create', () => {
    it('should create an InteractiveElement with valid props', () => {
      const props = createDefaultProps();
      const element = InteractiveElement.create(props);

      expect(element.selector).toBe('#test-button');
      expect(element.type).toBe('button');
      expect(element.text).toBe('Click Me');
      expect(element.tagName).toBe('button');
      expect(element.isVisible).toBe(true);
      expect(element.isEnabled).toBe(true);
    });

    it('should create an InteractiveElement with all element types', () => {
      const elementTypes: ElementType[] = [
        'link', 'button', 'input', 'select', 'textarea',
        'checkbox', 'radio', 'image', 'form', 'other',
      ];

      elementTypes.forEach(type => {
        const props = createDefaultProps({ type });
        const element = InteractiveElement.create(props);
        expect(element.type).toBe(type);
      });
    });
  });

  describe('getters', () => {
    it('should return correct attributes', () => {
      const props = createDefaultProps();
      const element = InteractiveElement.create(props);

      const attributes = element.attributes;
      expect(attributes.id).toBe('test-button');
      expect(attributes.class).toBe('btn btn-primary');
    });

    it('should return a copy of attributes', () => {
      const props = createDefaultProps();
      const element = InteractiveElement.create(props);

      const attributes = element.attributes;
      attributes.id = 'modified';

      expect(element.attributes.id).toBe('test-button');
    });

    it('should return correct boundingBox', () => {
      const props = createDefaultProps();
      const element = InteractiveElement.create(props);

      const box = element.boundingBox;
      expect(box).toEqual({ x: 100, y: 200, width: 120, height: 40 });
    });

    it('should return null for missing boundingBox', () => {
      const props = createDefaultProps({ boundingBox: null });
      const element = InteractiveElement.create(props);

      expect(element.boundingBox).toBeNull();
    });

    it('should return correct optional properties', () => {
      const props = createDefaultProps({
        ariaLabel: 'Test label',
        placeholder: 'Enter text',
        value: 'current value',
      });
      const element = InteractiveElement.create(props);

      expect(element.ariaLabel).toBe('Test label');
      expect(element.placeholder).toBe('Enter text');
      expect(element.value).toBe('current value');
    });
  });

  describe('describe', () => {
    it('should describe element with text', () => {
      const props = createDefaultProps({ text: 'Submit Form' });
      const element = InteractiveElement.create(props);

      const description = element.describe();
      expect(description).toContain('[button]');
      expect(description).toContain('"Submit Form"');
    });

    it('should describe element with aria-label when no text', () => {
      const props = createDefaultProps({ text: '', ariaLabel: 'Close dialog' });
      const element = InteractiveElement.create(props);

      const description = element.describe();
      expect(description).toContain('aria: "Close dialog"');
    });

    it('should describe element with placeholder when no text or aria-label', () => {
      const props = createDefaultProps({
        text: '',
        ariaLabel: undefined,
        placeholder: 'Enter email',
        type: 'input' as ElementType,
      });
      const element = InteractiveElement.create(props);

      const description = element.describe();
      expect(description).toContain('placeholder: "Enter email"');
    });

    it('should truncate long text in description', () => {
      const longText = 'A'.repeat(100);
      const props = createDefaultProps({ text: longText });
      const element = InteractiveElement.create(props);

      const description = element.describe();
      expect(description.length).toBeLessThan(100);
      expect(description).toContain('...');
    });
  });

  describe('toJSON', () => {
    it('should serialize element to JSON', () => {
      const props = createDefaultProps();
      const element = InteractiveElement.create(props);

      const json = element.toJSON();
      expect(json).toEqual(props);
    });
  });

  describe('equals', () => {
    it('should return true for equal elements', () => {
      const props = createDefaultProps();
      const element1 = InteractiveElement.create(props);
      const element2 = InteractiveElement.create(props);

      expect(element1.equals(element2)).toBe(true);
    });

    it('should return false for different elements', () => {
      const element1 = InteractiveElement.create(createDefaultProps({ selector: '#btn1' }));
      const element2 = InteractiveElement.create(createDefaultProps({ selector: '#btn2' }));

      expect(element1.equals(element2)).toBe(false);
    });
  });
});
