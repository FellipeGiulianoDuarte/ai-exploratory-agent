import { Entity } from '../shared/Entity';

/**
 * Finding type categories.
 */
export type FindingType =
  | 'broken_image'
  | 'console_error'
  | 'network_error'
  | 'accessibility'
  | 'usability'
  | 'functional'
  | 'performance'
  | 'security'
  | 'observed_bug'
  | 'text_issue'
  | 'ui_issue'
  | 'other';

/**
 * Finding severity levels.
 */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Evidence attached to a finding.
 */
export interface FindingEvidence {
  /** Type of evidence */
  type: 'screenshot' | 'log' | 'html' | 'network' | 'data';
  /** Description of the evidence */
  description: string;
  /** Path to file or inline data */
  data: string;
  /** When evidence was captured */
  capturedAt: Date;
}

/**
 * Properties for a Finding.
 */
export interface FindingProps {
  /** Session that discovered this finding */
  sessionId: string;
  /** Type of finding */
  type: FindingType;
  /** Severity level */
  severity: FindingSeverity;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** URL where finding was discovered */
  pageUrl: string;
  /** Page title */
  pageTitle: string;
  /** Step number when discovered */
  stepNumber: number;
  /** Evidence supporting the finding */
  evidence: FindingEvidence[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** When the finding was discovered */
  discoveredAt: Date;
  /** Whether finding has been reviewed */
  reviewed: boolean;
  /** Notes from review */
  reviewNotes?: string;
}

/**
 * Entity representing a discovered issue/finding.
 */
export class Finding extends Entity<FindingProps> {
  private constructor(props: FindingProps, id?: string) {
    super(props, id);
  }

  static create(
    props: Omit<FindingProps, 'evidence' | 'metadata' | 'discoveredAt' | 'reviewed'> & {
      evidence?: FindingEvidence[];
      metadata?: Record<string, unknown>;
    },
    id?: string
  ): Finding {
    return new Finding(
      {
        ...props,
        evidence: props.evidence || [],
        metadata: props.metadata || {},
        discoveredAt: new Date(),
        reviewed: false,
      },
      id
    );
  }

  /**
   * Create a finding from broken images.
   */
  static fromBrokenImages(
    sessionId: string,
    stepNumber: number,
    pageUrl: string,
    pageTitle: string,
    brokenCount: number,
    totalImages: number,
    details: string
  ): Finding {
    const severity: FindingSeverity =
      brokenCount > 5 ? 'high' : brokenCount > 2 ? 'medium' : 'low';

    return Finding.create({
      sessionId,
      type: 'broken_image',
      severity,
      title: `${brokenCount} broken image${brokenCount > 1 ? 's' : ''} found`,
      description: `Found ${brokenCount} broken images out of ${totalImages} total images on the page.\n\n${details}`,
      pageUrl,
      pageTitle,
      stepNumber,
      metadata: {
        brokenCount,
        totalImages,
        brokenPercentage: totalImages > 0 ? (brokenCount / totalImages) * 100 : 0,
      },
    });
  }

  /**
   * Create a finding from console errors.
   */
  static fromConsoleErrors(
    sessionId: string,
    stepNumber: number,
    pageUrl: string,
    pageTitle: string,
    errors: string[]
  ): Finding {
    const severity: FindingSeverity = errors.length > 10 ? 'high' : errors.length > 3 ? 'medium' : 'low';

    return Finding.create({
      sessionId,
      type: 'console_error',
      severity,
      title: `${errors.length} console error${errors.length > 1 ? 's' : ''} detected`,
      description: `Console errors found:\n${errors.slice(0, 10).map((e) => `- ${e}`).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more` : ''}`,
      pageUrl,
      pageTitle,
      stepNumber,
      metadata: {
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      },
    });
  }

  // Getters
  get sessionId(): string {
    return this.props.sessionId;
  }

  get type(): FindingType {
    return this.props.type;
  }

  get severity(): FindingSeverity {
    return this.props.severity;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string {
    return this.props.description;
  }

  get pageUrl(): string {
    return this.props.pageUrl;
  }

  get pageTitle(): string {
    return this.props.pageTitle;
  }

  get stepNumber(): number {
    return this.props.stepNumber;
  }

  get evidence(): ReadonlyArray<FindingEvidence> {
    return [...this.props.evidence];
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return { ...this.props.metadata };
  }

  get discoveredAt(): Date {
    return this.props.discoveredAt;
  }

  get reviewed(): boolean {
    return this.props.reviewed;
  }

  get reviewNotes(): string | undefined {
    return this.props.reviewNotes;
  }

  /**
   * Add evidence to the finding.
   */
  addEvidence(evidence: FindingEvidence): void {
    this.props.evidence.push(evidence);
  }

  /**
   * Mark as reviewed with optional notes.
   */
  markReviewed(notes?: string): void {
    this.props.reviewed = true;
    this.props.reviewNotes = notes;
  }

  /**
   * Update severity (e.g., after LLM analysis).
   */
  updateSeverity(severity: FindingSeverity): void {
    this.props.severity = severity;
  }

  /**
   * Get severity color for display.
   */
  getSeverityColor(): string {
    switch (this.props.severity) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'yellow';
      case 'low':
        return 'blue';
    }
  }

  /**
   * Get severity emoji for display.
   */
  getSeverityEmoji(): string {
    switch (this.props.severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🔵';
    }
  }

  /**
   * Get a brief summary.
   */
  summarize(): string {
    return `${this.getSeverityEmoji()} [${this.props.severity.toUpperCase()}] ${this.props.title} (${this.props.pageUrl})`;
  }

  toJSON(): FindingProps & { id: string } {
    return {
      id: this.id,
      ...this.props,
    };
  }
}
