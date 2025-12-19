import { ValueObject } from '../../domain/shared/ValueObject';
import { BrokenImage } from './BrokenImage';

/**
 * Properties for a BrokenImageReport value object.
 */
export interface BrokenImageReportProps {
  /** URL of the page that was scanned */
  pageUrl: string;
  /** Page title */
  pageTitle: string;
  /** Timestamp when the scan was performed */
  timestamp: Date;
  /** Total number of images found on the page */
  totalImages: number;
  /** Number of broken images found */
  brokenCount: number;
  /** List of broken images */
  brokenImages: BrokenImage[];
  /** Scan duration in milliseconds */
  scanDuration: number;
}

/**
 * Value object representing a report of broken images found on a page.
 */
export class BrokenImageReport extends ValueObject<BrokenImageReportProps> {
  private constructor(props: BrokenImageReportProps) {
    super(props);
  }

  static create(props: BrokenImageReportProps): BrokenImageReport {
    return new BrokenImageReport(props);
  }

  get pageUrl(): string {
    return this.props.pageUrl;
  }

  get pageTitle(): string {
    return this.props.pageTitle;
  }

  get timestamp(): Date {
    return this.props.timestamp;
  }

  get totalImages(): number {
    return this.props.totalImages;
  }

  get brokenCount(): number {
    return this.props.brokenCount;
  }

  get brokenImages(): BrokenImage[] {
    return [...this.props.brokenImages];
  }

  get scanDuration(): number {
    return this.props.scanDuration;
  }

  /**
   * Check if any broken images were found.
   */
  hasBrokenImages(): boolean {
    return this.props.brokenCount > 0;
  }

  /**
   * Get the percentage of broken images.
   */
  getBrokenPercentage(): number {
    if (this.props.totalImages === 0) return 0;
    return (this.props.brokenCount / this.props.totalImages) * 100;
  }

  /**
   * Get broken images grouped by reason.
   */
  getByReason(): Map<string, BrokenImage[]> {
    const grouped = new Map<string, BrokenImage[]>();
    for (const img of this.props.brokenImages) {
      const reason = img.reason;
      if (!grouped.has(reason)) {
        grouped.set(reason, []);
      }
      grouped.get(reason)!.push(img);
    }
    return grouped;
  }

  /**
   * Get broken images grouped by severity.
   */
  getBySeverity(): Map<string, BrokenImage[]> {
    const grouped = new Map<string, BrokenImage[]>();
    for (const img of this.props.brokenImages) {
      const severity = img.getSeverity();
      if (!grouped.has(severity)) {
        grouped.set(severity, []);
      }
      grouped.get(severity)!.push(img);
    }
    return grouped;
  }

  /**
   * Generate a summary string for the report.
   */
  summarize(): string {
    const lines: string[] = [
      `Broken Image Report`,
      `==================`,
      `Page: ${this.pageUrl}`,
      `Title: ${this.pageTitle}`,
      `Scanned: ${this.timestamp.toISOString()}`,
      `Duration: ${this.scanDuration}ms`,
      ``,
      `Results:`,
      `  Total images: ${this.totalImages}`,
      `  Broken images: ${this.brokenCount}`,
      `  Broken percentage: ${this.getBrokenPercentage().toFixed(1)}%`,
    ];

    if (this.hasBrokenImages()) {
      lines.push('', 'Broken Images:');
      for (const img of this.props.brokenImages) {
        lines.push(`  - ${img.src}`);
        lines.push(`    Reason: ${img.getReasonDescription()}`);
        lines.push(`    Severity: ${img.getSeverity()}`);
        if (img.alt) {
          lines.push(`    Alt: ${img.alt}`);
        }
      }
    }

    return lines.join('\n');
  }

  toJSON(): Record<string, unknown> {
    return {
      pageUrl: this.pageUrl,
      pageTitle: this.pageTitle,
      timestamp: this.timestamp.toISOString(),
      totalImages: this.totalImages,
      brokenCount: this.brokenCount,
      brokenPercentage: this.getBrokenPercentage(),
      scanDuration: this.scanDuration,
      brokenImages: this.props.brokenImages.map(img => img.toJSON()),
    };
  }
}
