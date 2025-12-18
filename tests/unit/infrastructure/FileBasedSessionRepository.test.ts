import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileBasedSessionRepository } from '../../../src/infrastructure/persistence/FileBasedSessionRepository';
import { ExplorationSession, ExplorationSessionConfig } from '../../../src/domain/exploration/ExplorationSession';

describe('FileBasedSessionRepository', () => {
  let repository: FileBasedSessionRepository;
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `session-repo-test-${Date.now()}`);
    repository = new FileBasedSessionRepository(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createTestSession = (id?: string): ExplorationSession => {
    const config: ExplorationSessionConfig = {
      targetUrl: 'https://example.com',
      objective: 'Test objective',
      maxSteps: 50,
      checkpointInterval: 10,
      minConfidenceThreshold: 0.5,
      checkpointOnToolFindings: true,
    };
    return ExplorationSession.create(config, id);
  };

  describe('save', () => {
    it('should save a session to a file', async () => {
      const session = createTestSession('test-session-1');
      
      await repository.save(session);
      
      // Verify file was created
      const filePath = path.join(testDir, 'test-session-1.json');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should save session data correctly', async () => {
      const session = createTestSession('test-session-2');
      
      await repository.save(session);
      
      const filePath = path.join(testDir, 'test-session-2.json');
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      
      expect(data.id).toBe('test-session-2');
      expect(data.config.targetUrl).toBe('https://example.com');
      expect(data.status).toBe('idle');
    });
  });

  describe('findById', () => {
    it('should return null for non-existent session', async () => {
      const result = await repository.findById('non-existent');
      expect(result).toBeNull();
    });

    it('should return a saved session', async () => {
      const session = createTestSession('test-session-3');
      await repository.save(session);
      
      const result = await repository.findById('test-session-3');
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('test-session-3');
    });

    it('should use cache for repeated lookups', async () => {
      const session = createTestSession('test-session-4');
      await repository.save(session);
      
      // First lookup
      const result1 = await repository.findById('test-session-4');
      // Second lookup should use cache
      const result2 = await repository.findById('test-session-4');
      
      expect(result1).toBe(result2); // Same reference from cache
    });
  });

  describe('findAll', () => {
    it('should return empty array when no sessions exist', async () => {
      const result = await repository.findAll();
      expect(result).toHaveLength(0);
    });

    it('should return all saved sessions', async () => {
      const session1 = createTestSession('session-a');
      const session2 = createTestSession('session-b');
      
      await repository.save(session1);
      await repository.save(session2);
      
      const result = await repository.findAll();
      
      expect(result).toHaveLength(2);
      const ids = result.map(s => s.id);
      expect(ids).toContain('session-a');
      expect(ids).toContain('session-b');
    });
  });

  describe('delete', () => {
    it('should return false for non-existent session', async () => {
      const result = await repository.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should delete a saved session', async () => {
      const session = createTestSession('session-to-delete');
      await repository.save(session);
      
      const deleted = await repository.delete('session-to-delete');
      const result = await repository.findById('session-to-delete');
      
      expect(deleted).toBe(true);
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return false for non-existent session', async () => {
      const result = await repository.exists('non-existent');
      expect(result).toBe(false);
    });

    it('should return true for existing session', async () => {
      const session = createTestSession('existing-session');
      await repository.save(session);
      
      const result = await repository.exists('existing-session');
      expect(result).toBe(true);
    });
  });

  describe('findMostRecent', () => {
    it('should return null when no sessions exist', async () => {
      const result = await repository.findMostRecent();
      expect(result).toBeNull();
    });

    it('should return the most recently started session', async () => {
      const session1 = createTestSession('older-session');
      const session2 = createTestSession('newer-session');
      
      // Simulate starting sessions at different times
      await session1.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      await session2.start();
      
      await repository.save(session1);
      await repository.save(session2);
      
      const result = await repository.findMostRecent();
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe('newer-session');
    });
  });

  describe('clearCache', () => {
    it('should clear the internal cache', async () => {
      const session = createTestSession('cached-session');
      await repository.save(session);
      
      // Populate cache
      await repository.findById('cached-session');
      
      // Clear cache
      repository.clearCache();
      
      // Verify we can still find it (from file, not cache)
      const result = await repository.findById('cached-session');
      expect(result).not.toBeNull();
    });
  });
});
