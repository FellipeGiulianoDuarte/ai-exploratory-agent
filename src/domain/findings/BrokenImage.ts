import { ValueObject } from '../../domain/shared/ValueObject';

/**
 * Reason why an image is considered broken.
 */
export type BrokenImageReason =
  | 'empty_src'
  | 'invalid_src'
  | 'http_error'
  | 'zero_dimensions'
  | 'load_timeout'
  | 'network_error';

/**
 * Properties for a BrokenImage value object.
 */
export interface BrokenImageProps {
  /** The src attribute of the image */
  src: string;
  /** Alt text of the image */
  alt: string;
  /** CSS selector to locate the image */
  selector: string;
  /** Why the image is considered broken */
  reason: BrokenImageReason;
  /** HTTP status code if applicable */
  httpStatus?: number;
  /** Additional details about the failure */
  details?: string;
  /** Natural width of the image (0 if not loaded) */
  naturalWidth: number;
  /** Natural height of the image (0 if not loaded) */
  naturalHeight: number;
  /** Location on the page */
  location: {
    x: number;
    y: number;
  } | null;
}

/**
 * Value object representing a broken image on a web page.
 */
export class BrokenImage extends ValueObject<BrokenImageProps> {
  private constructor(props: BrokenImageProps) {
    super(props);
  }

  static create(props: BrokenImageProps): BrokenImage {
    return new BrokenImage(props);
  }

  get src(): string {
    return this.props.src;
  }

  get alt(): string {
    return this.props.alt;
  }

  get selector(): string {
    return this.props.selector;
  }

  get reason(): BrokenImageReason {
    return this.props.reason;
  }

  get httpStatus(): number | undefined {
    return this.props.httpStatus;
  }

  get details(): string | undefined {
    return this.props.details;
  }

  get naturalWidth(): number {
    return this.props.naturalWidth;
  }

  get naturalHeight(): number {
    return this.props.naturalHeight;
  }

  get location(): BrokenImageProps['location'] {
    return this.props.location ? { ...this.props.location } : null;
  }

  /**
   * Get a human-readable description of why the image is broken.
   */
  getReasonDescription(): string {
    switch (this.props.reason) {
      case 'empty_src':
        return 'Image has empty or missing src attribute';
      case 'invalid_src':
        return 'Image has invalid src URL';
      case 'http_error':
        return `Image returned HTTP error ${this.props.httpStatus ?? 'unknown'}`;
      case 'zero_dimensions':
        return 'Image has zero width or height (failed to load)';
      case 'load_timeout':
        return 'Image loading timed out';
      case 'network_error':
        return 'Network error while loading image';
      default:
        return 'Unknown reason';
    }
  }

  /**
   * Get severity level of the broken image (for reporting).
   */
  getSeverity(): 'high' | 'medium' | 'low' {
    switch (this.props.reason) {
      case 'http_error':
        return this.props.httpStatus === 404 ? 'high' : 'medium';
      case 'empty_src':
      case 'invalid_src':
        return 'high';
      case 'zero_dimensions':
        return 'medium';
      case 'load_timeout':
      case 'network_error':
        return 'low';
      default:
        return 'medium';
    }
  }

  toJSON(): BrokenImageProps {
    return { ...this.props };
  }
}
