import * as fs from 'fs/promises';
import * as path from 'path';
import { FindingsRepository } from '../../application/ports/FindingsRepository';
import { Finding, FindingType, FindingSeverity, FindingProps } from '../../domain/exploration/Finding';

/**
 * File-based implementation of FindingsRepository.
 * Stores findings as JSON files in a directory structure.
 */
export class FileBasedFindingsRepository implements FindingsRepository {
  private baseDir: string;
  private cache: Map<string, Finding> = new Map();
  private initialized: boolean = false;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Ensure the base directory exists.
   */
  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(this.baseDir, { recursive: true });
      this.initialized = true;
    }
  }

  /**
   * Get the file path for a finding.
   */
  private getFilePath(sessionId: string, findingId: string): string {
    return path.join(this.baseDir, sessionId, `${findingId}.json`);
  }

  /**
   * Get the directory for a session's findings.
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId);
  }

  async save(finding: Finding): Promise<void> {
    await this.ensureDir();

    const sessionDir = this.getSessionDir(finding.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const filePath = this.getFilePath(finding.sessionId, finding.id);
    const data = JSON.stringify(finding.toJSON(), null, 2);

    await fs.writeFile(filePath, data, 'utf-8');
    this.cache.set(finding.id, finding);
  }

  async findById(id: string): Promise<Finding | null> {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    // Search all session directories
    await this.ensureDir();
    
    try {
      const sessions = await fs.readdir(this.baseDir);
      for (const sessionId of sessions) {
        const filePath = this.getFilePath(sessionId, id);
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const finding = this.deserializeFinding(JSON.parse(data));
          this.cache.set(id, finding);
          return finding;
        } catch {
          // File doesn't exist in this session, continue
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  }

  async findBySessionId(sessionId: string): Promise<Finding[]> {
    await this.ensureDir();
    const sessionDir = this.getSessionDir(sessionId);
    const findings: Finding[] = [];

    try {
      const files = await fs.readdir(sessionDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(sessionDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const finding = this.deserializeFinding(JSON.parse(data));
          findings.push(finding);
          this.cache.set(finding.id, finding);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return findings;
  }

  async findByType(sessionId: string, type: FindingType): Promise<Finding[]> {
    const findings = await this.findBySessionId(sessionId);
    return findings.filter((f) => f.type === type);
  }

  async findBySeverity(sessionId: string, severity: FindingSeverity): Promise<Finding[]> {
    const findings = await this.findBySessionId(sessionId);
    return findings.filter((f) => f.severity === severity);
  }

  async findAll(): Promise<Finding[]> {
    await this.ensureDir();
    const allFindings: Finding[] = [];

    try {
      const sessions = await fs.readdir(this.baseDir);
      for (const sessionId of sessions) {
        const sessionFindings = await this.findBySessionId(sessionId);
        allFindings.push(...sessionFindings);
      }
    } catch {
      // Directory doesn't exist
    }

    return allFindings;
  }

  async delete(id: string): Promise<boolean> {
    const finding = await this.findById(id);
    if (!finding) {
      return false;
    }

    const filePath = this.getFilePath(finding.sessionId, id);
    try {
      await fs.unlink(filePath);
      this.cache.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const findings = await this.findBySessionId(sessionId);
    const sessionDir = this.getSessionDir(sessionId);

    try {
      await fs.rm(sessionDir, { recursive: true });
      findings.forEach((f) => this.cache.delete(f.id));
      return findings.length;
    } catch {
      return 0;
    }
  }

  async countBySessionId(sessionId: string): Promise<number> {
    const findings = await this.findBySessionId(sessionId);
    return findings.length;
  }

  async getStatsBySessionId(sessionId: string): Promise<{
    total: number;
    byType: Record<FindingType, number>;
    bySeverity: Record<FindingSeverity, number>;
  }> {
    const findings = await this.findBySessionId(sessionId);

    const byType: Record<FindingType, number> = {
      broken_image: 0,
      console_error: 0,
      network_error: 0,
      accessibility: 0,
      usability: 0,
      functional: 0,
      performance: 0,
      security: 0,
      observed_bug: 0,
      text_issue: 0,
      ui_issue: 0,
      other: 0,
    };

    const bySeverity: Record<FindingSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const finding of findings) {
      byType[finding.type]++;
      bySeverity[finding.severity]++;
    }

    return {
      total: findings.length,
      byType,
      bySeverity,
    };
  }

  /**
   * Deserialize a finding from JSON.
   */
  private deserializeFinding(data: FindingProps & { id: string }): Finding {
    // Reconstruct the Finding from stored data
    return Finding.create(
      {
        sessionId: data.sessionId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        description: data.description,
        pageUrl: data.pageUrl,
        pageTitle: data.pageTitle,
        stepNumber: data.stepNumber,
        evidence: data.evidence,
        metadata: data.metadata,
      },
      data.id
    );
  }
}
