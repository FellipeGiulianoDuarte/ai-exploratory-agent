import { BaseTool } from '../../domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../domain/tools/Tool';

/**
 * Parameters for the ScreenshotCaptureTool.
 */
export interface ScreenshotCaptureParams {
  /** Whether to capture full page or just viewport */
  fullPage?: boolean;
  /** Name/description for the screenshot (used in filename) */
  description?: string;
  /** Image format */
  type?: 'png' | 'jpeg';
  /** Image quality (for jpeg only, 0-100) */
  quality?: number;
}

/**
 * Screenshot capture report.
 */
export interface ScreenshotReport {
  pageUrl: string;
  pageTitle: string;
  timestamp: Date;
  filepath: string;
  filename: string;
  description: string;
  fullPage: boolean;
  filesize?: number;
  summary: string;
}

/**
 * Tool that captures screenshots of the current page or specific elements.
 *
 * Useful for:
 * - Capturing visual evidence of bugs
 * - Documenting broken UI states
 * - Recording error messages
 * - Creating visual regression references
 */
export class ScreenshotCaptureTool extends BaseTool<ScreenshotCaptureParams, ScreenshotReport> {
  readonly name = 'capture_screenshot';
  readonly description =
    'Captures a screenshot of the current page for visual evidence. Useful for documenting bugs, errors, and broken UI states.';

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      fullPage: {
        type: 'boolean',
        description: 'Whether to capture full page (scrolling) or just viewport',
        required: false,
        default: false,
      },
      description: {
        type: 'string',
        description: 'Description for the screenshot (used in filename)',
        required: false,
        default: 'screenshot',
      },
      type: {
        type: 'string',
        description: 'Image format: png or jpeg',
        required: false,
        default: 'png',
      },
      quality: {
        type: 'number',
        description: 'Image quality for jpeg (0-100)',
        required: false,
        default: 90,
      },
    };
  }

  protected async executeInternal(
    params: ScreenshotCaptureParams,
    context: ToolContext
  ): Promise<ScreenshotReport> {
    // Get page info
    const [pageUrl, pageTitle] = await Promise.all([
      context.browser.getCurrentUrl(),
      context.browser.getTitle(),
    ]);

    // Sanitize description for filename
    const description = params.description || 'screenshot';
    const sanitizedDesc = this.sanitizeFilename(description);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sanitizedDesc}-${timestamp}.${params.type || 'png'}`;

    // Capture screenshot
    const filepath = await context.browser.screenshot({
      path: filename,
      fullPage: params.fullPage ?? false,
      type: params.type || 'png',
      quality: params.type === 'jpeg' ? params.quality : undefined,
    });

    // Get file size if possible
    let filesize: number | undefined;
    try {
      const fs = await import('fs');
      const stats = fs.statSync(filepath);
      filesize = stats.size;
    } catch {
      // Ignore errors getting file size
    }

    // Generate summary
    const summary = this.generateSummary(pageUrl, description, params.fullPage ?? false, filesize);

    return {
      pageUrl,
      pageTitle,
      timestamp: new Date(),
      filepath,
      filename,
      description,
      fullPage: params.fullPage ?? false,
      filesize,
      summary,
    };
  }

  /**
   * Sanitize a string for use in filename.
   */
  private sanitizeFilename(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  /**
   * Generate summary text.
   */
  private generateSummary(
    url: string,
    description: string,
    fullPage: boolean,
    filesize?: number
  ): string {
    const lines: string[] = [];
    lines.push(`Screenshot captured: ${description}`);
    lines.push(`  URL: ${url}`);
    lines.push(`  Type: ${fullPage ? 'Full page' : 'Viewport only'}`);

    if (filesize) {
      const sizeMB = (filesize / (1024 * 1024)).toFixed(2);
      const sizeKB = (filesize / 1024).toFixed(0);
      lines.push(`  Size: ${sizeMB}MB (${sizeKB}KB)`);
    }

    return lines.join('\n');
  }
}
