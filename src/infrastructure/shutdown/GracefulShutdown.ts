/**
 * GracefulShutdown
 *
 * Handles graceful shutdown of the application:
 * - Catches SIGINT, SIGTERM, and uncaught exceptions
 * - Allows cleanup handlers to run
 * - Saves session state before exit
 */

import { Logger, getLogger } from '../../infrastructure/logging';

export type ShutdownHandler = () => Promise<void>;

/**
 * Manages graceful shutdown of the application.
 */
export class GracefulShutdown {
  private static instance: GracefulShutdown | null = null;
  private logger: Logger;
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private registered = false;

  private constructor() {
    this.logger = getLogger('Shutdown');
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown();
    }
    return GracefulShutdown.instance;
  }

  /**
   * Register a cleanup handler to run during shutdown.
   * Handlers are called in LIFO order (last registered first).
   */
  registerHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Remove a cleanup handler.
   */
  removeHandler(handler: ShutdownHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Register process event listeners.
   */
  register(): void {
    if (this.registered) {
      return;
    }

    this.registered = true;

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT signal');
      void this.shutdown('SIGINT');
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM signal');
      void this.shutdown('SIGTERM');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      void this.shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      this.logger.error('Unhandled rejection', { reason: message });
      void this.shutdown('unhandledRejection');
    });

    this.logger.debug('Graceful shutdown handlers registered');
  }

  /**
   * Execute shutdown sequence.
   */
  async shutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`Starting graceful shutdown (reason: ${reason})`);

    // Run handlers in reverse order (LIFO)
    const handlersToRun = [...this.handlers].reverse();

    for (let i = 0; i < handlersToRun.length; i++) {
      const handler = handlersToRun[i];
      try {
        this.logger.debug(`Running shutdown handler ${i + 1}/${handlersToRun.length}`);
        await handler();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Shutdown handler ${i + 1} failed`, { error: message });
      }
    }

    this.logger.info('Graceful shutdown complete');

    // Exit with appropriate code
    const exitCode = reason === 'SIGINT' || reason === 'SIGTERM' ? 0 : 1;
    process.exit(exitCode);
  }

  /**
   * Check if shutdown is in progress.
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Reset instance (for testing).
   */
  static reset(): void {
    if (GracefulShutdown.instance) {
      GracefulShutdown.instance.handlers = [];
      GracefulShutdown.instance.isShuttingDown = false;
    }
    GracefulShutdown.instance = null;
  }
}

/**
 * Convenience function to register a shutdown handler.
 */
export function onShutdown(handler: ShutdownHandler): void {
  GracefulShutdown.getInstance().registerHandler(handler);
}

/**
 * Initialize graceful shutdown handling.
 */
export function initGracefulShutdown(): GracefulShutdown {
  const shutdown = GracefulShutdown.getInstance();
  shutdown.register();
  return shutdown;
}
