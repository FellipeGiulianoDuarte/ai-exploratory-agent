/**
 * Structured Logger
 *
 * Provides structured logging with levels (DEBUG, INFO, WARN, ERROR)
 * to replace console.log scattered throughout the codebase.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  context?: LogContext;
}

export interface LoggerConfig {
  /** Minimum log level to output (default: 'info') */
  minLevel: LogLevel;
  /** Whether to include timestamps (default: true) */
  includeTimestamp: boolean;
  /** Whether to use colors in console output (default: true) */
  useColors: boolean;
  /** Whether to output as JSON (default: false) */
  jsonOutput: boolean;
  /** Custom log handler */
  customHandler?: (entry: LogEntry) => void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // Gray
  info: '\x1b[36m', // Cyan
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

const CATEGORY_COLORS: Record<string, string> = {
  Session: '\x1b[35m', // Magenta
  PageContext: '\x1b[34m', // Blue
  URLDiscovery: '\x1b[32m', // Green
  ExitCriteria: '\x1b[33m', // Yellow
  Validation: '\x1b[36m', // Cyan
  ToolLoop: '\x1b[31m', // Red
  ActionLoop: '\x1b[31m', // Red
  PersonaManager: '\x1b[35m', // Magenta
  LLM: '\x1b[34m', // Blue
  Progress: '\x1b[32m', // Green
  Finding: '\x1b[33m', // Yellow
  Event: '\x1b[90m', // Gray
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  includeTimestamp: false,
  useColors: true,
  jsonOutput: false,
};

/**
 * Structured logger with levels and categories.
 */
export class Logger {
  private config: LoggerConfig;
  private category: string;

  constructor(category: string, config: Partial<LoggerConfig> = {}) {
    this.category = category;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format and output a log entry.
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      context,
    };

    if (this.config.customHandler) {
      this.config.customHandler(entry);
      return;
    }

    if (this.config.jsonOutput) {
      this.outputJson(entry);
    } else {
      this.outputText(entry);
    }
  }

  /**
   * Output as JSON.
   */
  private outputJson(entry: LogEntry): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }

  /**
   * Output as formatted text.
   */
  private outputText(entry: LogEntry): void {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      const time = entry.timestamp.split('T')[1].split('.')[0];
      if (this.config.useColors) {
        parts.push(`${DIM}${time}${RESET}`);
      } else {
        parts.push(time);
      }
    }

    const levelColor = this.config.useColors ? LOG_COLORS[entry.level] : '';
    const categoryColor = this.config.useColors
      ? CATEGORY_COLORS[entry.category] || '\x1b[37m'
      : '';

    if (this.config.useColors) {
      parts.push(`${categoryColor}[${entry.category}]${RESET}`);
    } else {
      parts.push(`[${entry.category}]`);
    }

    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
      if (this.config.useColors) {
        parts.push(`${DIM}(${contextStr})${RESET}`);
      } else {
        parts.push(`(${contextStr})`);
      }
    }

    const output = parts.join(' ');

    switch (entry.level) {
      case 'error':
        // eslint-disable-next-line no-console
        console.error(this.config.useColors ? `${levelColor}${output}${RESET}` : output);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(this.config.useColors ? `${levelColor}${output}${RESET}` : output);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(output);
    }
  }

  /**
   * Log a debug message.
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message.
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log an error message.
   */
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log a progress update with visual formatting.
   */
  progress(
    currentStep: number,
    maxSteps: number,
    data: { url: string; pagesVisited: number; findings: number; recentActions: string[] }
  ): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const separator = '─'.repeat(60);
    // eslint-disable-next-line no-console
    console.log(`\n${separator}`);
    // eslint-disable-next-line no-console
    console.log(`📊 Progress Update (Step ${currentStep}/${maxSteps})`);
    // eslint-disable-next-line no-console
    console.log(separator);
    // eslint-disable-next-line no-console
    console.log(`📍 Current URL: ${data.url}`);
    // eslint-disable-next-line no-console
    console.log(`📄 Pages visited: ${data.pagesVisited}`);
    // eslint-disable-next-line no-console
    console.log(`🔍 Findings: ${data.findings}`);
    // eslint-disable-next-line no-console
    console.log(`\n📝 Recent actions:`);
    data.recentActions.slice(-3).forEach(a => {
      // eslint-disable-next-line no-console
      console.log(`   • ${a}`);
    });
    // eslint-disable-next-line no-console
    console.log(`${separator}\n`);
  }

  /**
   * Log a finding with severity emoji.
   */
  finding(severity: 'critical' | 'high' | 'medium' | 'low', message: string): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const emoji =
      severity === 'critical'
        ? '🔴'
        : severity === 'high'
          ? '🟠'
          : severity === 'medium'
            ? '🟡'
            : '🟢';
    // eslint-disable-next-line no-console
    console.log(`${emoji} [${severity.toUpperCase()}] ${message}`);
  }

  /**
   * Create a child logger with a sub-category.
   */
  child(subCategory: string): Logger {
    return new Logger(`${this.category}:${subCategory}`, this.config);
  }
}

/**
 * Global logger configuration.
 */
let globalConfig: Partial<LoggerConfig> = {};

/**
 * Set global logger configuration.
 */
export function setGlobalLoggerConfig(config: Partial<LoggerConfig>): void {
  globalConfig = config;
}

/**
 * Get a logger for a category.
 */
export function getLogger(category: string): Logger {
  return new Logger(category, globalConfig);
}

/**
 * Create loggers for common categories.
 */
export const loggers = {
  session: getLogger('Session'),
  pageContext: getLogger('PageContext'),
  urlDiscovery: getLogger('URLDiscovery'),
  exitCriteria: getLogger('ExitCriteria'),
  validation: getLogger('Validation'),
  toolLoop: getLogger('ToolLoop'),
  actionLoop: getLogger('ActionLoop'),
  personaManager: getLogger('PersonaManager'),
  llm: getLogger('LLM'),
  progress: getLogger('Progress'),
  finding: getLogger('Finding'),
  event: getLogger('Event'),
};
