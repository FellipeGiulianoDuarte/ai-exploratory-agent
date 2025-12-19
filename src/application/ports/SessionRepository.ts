import { ExplorationSession } from '../../domain/exploration/ExplorationSession';

/**
 * Repository interface for persisting and querying exploration sessions.
 */
export interface SessionRepository {
  /**
   * Save a session.
   */
  save(session: ExplorationSession): Promise<void>;

  /**
   * Get a session by ID.
   */
  findById(id: string): Promise<ExplorationSession | null>;

  /**
   * Get all sessions.
   */
  findAll(): Promise<ExplorationSession[]>;

  /**
   * Find sessions by status.
   */
  findByStatus(status: string): Promise<ExplorationSession[]>;

  /**
   * Delete a session.
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if a session exists.
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get the most recent session (for resuming).
   */
  /**
   * Get the most recent session (for resuming).
   */
  findMostRecent(): Promise<ExplorationSession | null>;

  /**
   * Get the base directory where sessions are stored.
   */
  getBaseDir(): string;
}
