import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';
import { BrokenImage, BrokenImageReason } from '../../domain/findings/BrokenImage';
import { BrokenImageReport } from '../../domain/findings/BrokenImageReport';

/**
 * Parameters for the BrokenImageDetectorTool.
 */
export interface BrokenImageDetectorParams {
  /** Timeout for image loading check in milliseconds */
  timeout?: number;
  /** Whether to check HTTP status via HEAD request */
  checkHttpStatus?: boolean;
}

/**
 * Raw image data extracted from the page.
 */
interface RawImageData {
  src: string;
  alt: string;
  selector: string;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  currentSrc: string;
  x: number;
  y: number;
}

/**
 * Tool that detects broken images on a web page.
 *
 * Detection methods:
 * - Empty/invalid src attributes
 * - HTTP error responses (via HEAD request)
 * - Zero naturalWidth/naturalHeight (failed to load)
 * - Images that never completed loading
 */
export class BrokenImageDetectorTool extends BaseTool<
  BrokenImageDetectorParams,
  BrokenImageReport
> {
  readonly name = 'find_broken_images';
  readonly description =
    'Scans the current page for broken images including HTTP errors, missing sources, and images that failed to load';

  private readonly defaultTimeout = 5000;

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      timeout: {
        type: 'number',
        description: 'Timeout for image loading check in milliseconds',
        required: false,
        default: this.defaultTimeout,
      },
      checkHttpStatus: {
        type: 'boolean',
        description: 'Whether to check HTTP status via HEAD request',
        required: false,
        default: true,
      },
    };
  }

  protected async executeInternal(
    params: BrokenImageDetectorParams,
    context: ToolContext
  ): Promise<BrokenImageReport> {
    const startTime = Date.now();
    const timeout = params.timeout ?? this.defaultTimeout;
    const checkHttpStatus = params.checkHttpStatus ?? true;

    // Extract all images from the page
    const rawImages = await this.extractImages(context);
    const brokenImages: BrokenImage[] = [];

    // Check each image for issues
    for (const img of rawImages) {
      const brokenImage = await this.checkImage(img, context, timeout, checkHttpStatus);
      if (brokenImage) {
        brokenImages.push(brokenImage);
      }
    }

    // Get page info
    const [pageUrl, pageTitle] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
    ]);

    return BrokenImageReport.create({
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      totalImages: rawImages.length,
      brokenCount: brokenImages.length,
      brokenImages,
      scanDuration: Date.now() - startTime,
    });
  }

  /**
   * Extract all images from the current page.
   */
  private async extractImages(context: ToolContext): Promise<RawImageData[]> {
    return context.browser.evaluate<RawImageData[]>(() => {
      const images = document.querySelectorAll('img');
      const result: RawImageData[] = [];
      let index = 0;

      images.forEach(img => {
        const rect = img.getBoundingClientRect();

        // Generate a selector for this image
        let selector = '';
        if (img.id) {
          selector = `#${img.id}`;
        } else if (img.getAttribute('data-test')) {
          selector = `[data-test="${img.getAttribute('data-test')}"]`;
        } else if (img.className) {
          selector = `img.${img.className.split(' ').join('.')}`;
        } else {
          selector = `img:nth-of-type(${++index})`;
        }

        result.push({
          src: img.src || img.getAttribute('src') || '',
          alt: img.alt || '',
          selector,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          currentSrc: img.currentSrc || '',
          x: rect.x,
          y: rect.y,
        });
      });

      return result;
    });
  }

  /**
   * Check a single image for issues.
   */
  private async checkImage(
    img: RawImageData,
    _context: ToolContext,
    _timeout: number,
    checkHttpStatus: boolean
  ): Promise<BrokenImage | null> {
    // Check for empty or invalid src
    if (!img.src || img.src.trim() === '') {
      return BrokenImage.create({
        src: img.src,
        alt: img.alt,
        selector: img.selector,
        reason: 'empty_src',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        location: { x: img.x, y: img.y },
        details: 'Image has no src attribute',
      });
    }

    // Check for invalid src (data URLs are valid, but check for malformed URLs)
    if (!this.isValidImageSrc(img.src)) {
      return BrokenImage.create({
        src: img.src,
        alt: img.alt,
        selector: img.selector,
        reason: 'invalid_src',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        location: { x: img.x, y: img.y },
        details: 'Image src is not a valid URL',
      });
    }

    // Check for zero dimensions (indicates failed load)
    if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
      // Could be HTTP error or other load failure
      let reason: BrokenImageReason = 'zero_dimensions';
      let httpStatus: number | undefined;
      let details = 'Image loaded but has zero dimensions';

      // Try to get HTTP status if it's an HTTP(S) URL
      if (checkHttpStatus && (img.src.startsWith('http://') || img.src.startsWith('https://'))) {
        try {
          const status = await this.checkHttpStatus(img.src);
          if (status && status >= 400) {
            reason = 'http_error';
            httpStatus = status;
            details = `HTTP ${status} error`;
          }
        } catch {
          // HTTP check failed, keep zero_dimensions reason
        }
      }

      return BrokenImage.create({
        src: img.src,
        alt: img.alt,
        selector: img.selector,
        reason,
        httpStatus,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        location: { x: img.x, y: img.y },
        details,
      });
    }

    // Check if image hasn't completed loading
    if (!img.complete) {
      return BrokenImage.create({
        src: img.src,
        alt: img.alt,
        selector: img.selector,
        reason: 'load_timeout',
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        location: { x: img.x, y: img.y },
        details: 'Image has not completed loading',
      });
    }

    // Image is OK
    return null;
  }

  /**
   * Validate if a src is a valid image source.
   */
  private isValidImageSrc(src: string): boolean {
    // Data URLs are valid
    if (src.startsWith('data:')) {
      return true;
    }

    // Blob URLs are valid
    if (src.startsWith('blob:')) {
      return true;
    }

    // HTTP(S) URLs
    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        new URL(src);
        return true;
      } catch {
        return false;
      }
    }

    // Relative URLs (will be resolved by the browser)
    if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) {
      return true;
    }

    // Protocol-relative URLs
    if (src.startsWith('//')) {
      return true;
    }

    // Other schemes might be invalid
    if (src.includes(':')) {
      // Check for common valid schemes
      const validSchemes = ['data:', 'blob:', 'http:', 'https:', 'file:'];
      return validSchemes.some(scheme => src.startsWith(scheme));
    }

    // Assume relative URL
    return true;
  }

  /**
   * Check HTTP status of an image URL.
   */
  private async checkHttpStatus(url: string): Promise<number | null> {
    try {
      // Use fetch with HEAD method to check status without downloading
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors', // This might limit status info
      });
      return response.status;
    } catch {
      return null;
    }
  }
}
