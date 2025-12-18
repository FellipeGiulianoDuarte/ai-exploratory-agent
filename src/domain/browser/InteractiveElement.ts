import { ValueObject } from '../shared/ValueObject';

/**
 * Represents the type of an interactive element on a web page.
 */
export type ElementType =
  | 'link'
  | 'button'
  | 'input'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'image'
  | 'form'
  | 'other';

/**
 * Properties for an InteractiveElement value object.
 */
export interface InteractiveElementProps {
  /** CSS selector to locate the element */
  selector: string;
  /** Type of the interactive element */
  type: ElementType;
  /** Visible text content of the element */
  text: string;
  /** HTML tag name (e.g., 'a', 'button', 'input') */
  tagName: string;
  /** Element attributes (id, class, name, etc.) */
  attributes: Record<string, string>;
  /** Bounding box coordinates */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  /** Whether the element is visible on the page */
  isVisible: boolean;
  /** Whether the element is enabled for interaction */
  isEnabled: boolean;
  /** Aria label if present */
  ariaLabel?: string;
  /** Placeholder text for inputs */
  placeholder?: string;
  /** Current value for form elements */
  value?: string;
}

/**
 * Value object representing an interactive element on a web page.
 * These are elements that can be clicked, filled, or otherwise interacted with.
 */
export class InteractiveElement extends ValueObject<InteractiveElementProps> {
  private constructor(props: InteractiveElementProps) {
    super(props);
  }

  /**
   * Creates a new InteractiveElement.
   */
  public static create(props: InteractiveElementProps): InteractiveElement {
    return new InteractiveElement(props);
  }

  public get selector(): string {
    return this.props.selector;
  }

  public get type(): ElementType {
    return this.props.type;
  }

  public get text(): string {
    return this.props.text;
  }

  public get tagName(): string {
    return this.props.tagName;
  }

  public get attributes(): Record<string, string> {
    return { ...this.props.attributes };
  }

  public get boundingBox(): InteractiveElementProps['boundingBox'] {
    return this.props.boundingBox ? { ...this.props.boundingBox } : null;
  }

  public get isVisible(): boolean {
    return this.props.isVisible;
  }

  public get isEnabled(): boolean {
    return this.props.isEnabled;
  }

  public get ariaLabel(): string | undefined {
    return this.props.ariaLabel;
  }

  public get placeholder(): string | undefined {
    return this.props.placeholder;
  }

  public get value(): string | undefined {
    return this.props.value;
  }

  /**
   * Returns a human-readable description of this element.
   */
  public describe(): string {
    const parts: string[] = [];

    parts.push(`[${this.type}]`);

    if (this.text) {
      parts.push(`"${this.text.substring(0, 50)}${this.text.length > 50 ? '...' : ''}"`);
    } else if (this.ariaLabel) {
      parts.push(`aria: "${this.ariaLabel}"`);
    } else if (this.placeholder) {
      parts.push(`placeholder: "${this.placeholder}"`);
    } else if (this.props.attributes['id']) {
      parts.push(`#${this.props.attributes['id']}`);
    } else if (this.props.attributes['name']) {
      parts.push(`name="${this.props.attributes['name']}"`);
    }

    return parts.join(' ');
  }

  /**
   * Serializes the element to a plain object.
   */
  public toJSON(): InteractiveElementProps {
    return { ...this.props };
  }
}
