import { Finding, FindingType, FindingSeverity } from '../../domain/exploration/Finding';

/**
 * Repository interface for persisting and querying findings.
 */
export interface FindingsRepository {
  /**
   * Save a finding.
   */
  save(finding: Finding): Promise<void>;

  /**
   * Get a finding by ID.
   */
  findById(id: string): Promise<Finding | null>;

  /**
   * Get all findings for a session.
   */
  findBySessionId(sessionId: string): Promise<Finding[]>;

  /**
   * Get findings by type.
   */
  findByType(sessionId: string, type: FindingType): Promise<Finding[]>;

  /**
   * Get findings by severity.
   */
  findBySeverity(sessionId: string, severity: FindingSeverity): Promise<Finding[]>;

  /**
   * Get all findings.
   */
  findAll(): Promise<Finding[]>;

  /**
   * Delete a finding.
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all findings for a session.
   */
  deleteBySessionId(sessionId: string): Promise<number>;

  /**
   * Count findings for a session.
   */
  countBySessionId(sessionId: string): Promise<number>;

  /**
   * Get statistics for a session.
   */
  getStatsBySessionId(sessionId: string): Promise<{
    total: number;
    byType: Record<FindingType, number>;
    bySeverity: Record<FindingSeverity, number>;
  }>;
}
