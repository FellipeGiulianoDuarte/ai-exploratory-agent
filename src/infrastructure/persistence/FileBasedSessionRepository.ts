import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionRepository } from '../../application/ports/SessionRepository';
import { ExplorationSession } from '../../domain/exploration/ExplorationSession';

/**
 * File-based implementation of SessionRepository.
 * Stores sessions in ./sessions directory within the project for persistence.
 */
export class FileBasedSessionRepository implements SessionRepository {
  private baseDir: string;
  private cache: Map<string, ExplorationSession> = new Map();
  private initialized: boolean = false;

  constructor(baseDir?: string) {
    // Use ./sessions directory in project root by default
    this.baseDir = baseDir || path.join(process.cwd(), 'sessions');
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
   * Get the file path for a session.
   */
  private getFilePath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}.json`);
  }

  async save(session: ExplorationSession): Promise<void> {
    await this.ensureDir();

    const filePath = this.getFilePath(session.id);
    const data = JSON.stringify(session.toJSON(), null, 2);

    await fs.writeFile(filePath, data, 'utf-8');
    this.cache.set(session.id, session);
  }

  async findById(id: string): Promise<ExplorationSession | null> {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    await this.ensureDir();

    const filePath = this.getFilePath(id);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const session = ExplorationSession.fromJSON(JSON.parse(data));
      this.cache.set(id, session);
      return session;
    } catch {
      // File doesn't exist
      return null;
    }
  }

  async findAll(): Promise<ExplorationSession[]> {
    await this.ensureDir();
    const sessions: ExplorationSession[] = [];

    try {
      const files = await fs.readdir(this.baseDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.baseDir, file);
          try {
            const data = await fs.readFile(filePath, 'utf-8');
            const session = ExplorationSession.fromJSON(JSON.parse(data));
            sessions.push(session);
            this.cache.set(session.id, session);
          } catch {
            // Skip corrupted files
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return sessions;
  }

  async findByStatus(status: string): Promise<ExplorationSession[]> {
    const allSessions = await this.findAll();
    return allSessions.filter(s => s.status === status);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureDir();

    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      this.cache.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  async exists(id: string): Promise<boolean> {
    if (this.cache.has(id)) {
      return true;
    }

    await this.ensureDir();

    const filePath = this.getFilePath(id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async findMostRecent(): Promise<ExplorationSession | null> {
    const allSessions = await this.findAll();

    if (allSessions.length === 0) {
      return null;
    }

    // Sort by startedAt descending, handling null values
    const sorted = allSessions.sort((a, b) => {
      const aJson = a.toJSON();
      const bJson = b.toJSON();
      const aTime = aJson.startedAt ? new Date(aJson.startedAt as string).getTime() : 0;
      const bTime = bJson.startedAt ? new Date(bJson.startedAt as string).getTime() : 0;
      return bTime - aTime;
    });

    return sorted[0];
  }

  /**
   * Find resumable sessions (paused or running).
   */
  async findResumable(): Promise<ExplorationSession[]> {
    const allSessions = await this.findAll();
    return allSessions.filter(s => s.status === 'paused' || s.status === 'running');
  }

  /**
   * Get the base directory path (useful for debugging).
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Clear all cached sessions.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
