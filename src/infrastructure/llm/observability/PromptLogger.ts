/**
 * Logger for tracking all prompts sent to LLMs.
 * Enables debugging, auditing, and analysis of prompt effectiveness.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPromptConfig } from '../config/prompt-config';

export type PromptTaskType = 'decision' | 'analysis' | 'summary' | 'availability';

export interface PromptLogEntry {
  /** Unique identifier for this prompt */
  id: string;
  /** Timestamp when prompt was sent */
  timestamp: string;
  /** Type of task this prompt is for */
  taskType: PromptTaskType;
  /** System prompt sent to LLM */
  systemPrompt: string;
  /** User prompt sent to LLM */
  userPrompt: string;
  /** Additional metadata */
  metadata: {
    sessionId?: string;
    step?: number;
    url?: string;
    llmProvider?: string;
    llmModel?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface PromptLogMetadata {
  sessionId?: string;
  step?: number;
  url?: string;
  llmProvider?: string;
  llmModel?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Singleton logger for prompt tracking.
 */
export class PromptLogger {
  private static instance: PromptLogger;
  private logDirectory: string;
  private enabled: boolean;

  private constructor() {
    const config = getPromptConfig();
    this.logDirectory = config.logging.directory;
    this.enabled = config.logging.enabled;

    // Create log directory if it doesn't exist
    if (this.enabled && !fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  static getInstance(): PromptLogger {
    if (!PromptLogger.instance) {
      PromptLogger.instance = new PromptLogger();
    }
    return PromptLogger.instance;
  }

  /**
   * Log a prompt sent to an LLM.
   */
  logPrompt(
    taskType: PromptTaskType,
    systemPrompt: string,
    userPrompt: string,
    metadata: PromptLogMetadata = {}
  ): string {
    if (!this.enabled) {
      return ''; // Return empty ID if logging disabled
    }

    const entry: PromptLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      taskType,
      systemPrompt,
      userPrompt,
      metadata,
    };

    this.writeLogEntry(entry);
    return entry.id;
  }

  /**
   * Generate a unique ID for this prompt.
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Write log entry to file.
   */
  private writeLogEntry(entry: PromptLogEntry): void {
    try {
      const filename = this.getLogFilename(entry);
      const filepath = path.join(this.logDirectory, filename);

      // Write JSON file
      fs.writeFileSync(filepath, JSON.stringify(entry, null, 2), 'utf-8');

      // Also write human-readable version
      const readableFilename = filename.replace('.json', '.txt');
      const readableFilepath = path.join(this.logDirectory, readableFilename);
      const readableContent = this.formatReadable(entry);
      fs.writeFileSync(readableFilepath, readableContent, 'utf-8');
    } catch (error) {
      // Don't throw - logging failures shouldn't break the application
      console.error('Failed to write prompt log:', error);
    }
  }

  /**
   * Get filename for log entry.
   */
  private getLogFilename(entry: PromptLogEntry): string {
    const { sessionId, step } = entry.metadata;
    const parts = [entry.id];

    if (sessionId) {
      parts.push(sessionId.substring(0, 8)); // First 8 chars of session ID
    }

    if (step !== undefined) {
      parts.push(`step${step}`);
    }

    parts.push(entry.taskType);

    return `${parts.join('-')}.json`;
  }

  /**
   * Format entry as human-readable text.
   */
  private formatReadable(entry: PromptLogEntry): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`PROMPT LOG - ${entry.taskType.toUpperCase()}`);
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`ID: ${entry.id}`);
    lines.push(`Timestamp: ${entry.timestamp}`);
    lines.push(`Task Type: ${entry.taskType}`);
    lines.push('');

    if (Object.keys(entry.metadata).length > 0) {
      lines.push('METADATA');
      lines.push('-'.repeat(80));
      for (const [key, value] of Object.entries(entry.metadata)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${value}`);
        }
      }
      lines.push('');
    }

    lines.push('SYSTEM PROMPT');
    lines.push('-'.repeat(80));
    lines.push(entry.systemPrompt);
    lines.push('');

    lines.push('USER PROMPT');
    lines.push('-'.repeat(80));
    lines.push(entry.userPrompt);
    lines.push('');

    lines.push('='.repeat(80));
    lines.push(`END OF PROMPT LOG - ${entry.id}`);
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Enable or disable logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get all log entries for a session.
   */
  getSessionLogs(sessionId: string): PromptLogEntry[] {
    if (!fs.existsSync(this.logDirectory)) {
      return [];
    }

    const files = fs.readdirSync(this.logDirectory);
    const sessionFiles = files.filter(
      f => f.includes(sessionId.substring(0, 8)) && f.endsWith('.json')
    );

    return sessionFiles.map(f => {
      const filepath = path.join(this.logDirectory, f);
      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content) as PromptLogEntry;
    });
  }
}

/**
 * Convenience function to get the logger instance.
 */
export function getPromptLogger(): PromptLogger {
  return PromptLogger.getInstance();
}
