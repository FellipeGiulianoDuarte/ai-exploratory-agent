/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Logger, getLogger, setGlobalLoggerConfig } from '../../../src/infrastructure/logging';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    setGlobalLoggerConfig({});
  });

  describe('log levels', () => {
    it('should log info messages by default', () => {
      const logger = new Logger('Test');
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log debug messages by default', () => {
      const logger = new Logger('Test');
      logger.debug('Debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when level is debug', () => {
      const logger = new Logger('Test', { minLevel: 'debug' });
      logger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      const logger = new Logger('Test');
      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      const logger = new Logger('Test');
      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log info when level is warn', () => {
      const logger = new Logger('Test', { minLevel: 'warn' });
      logger.info('Info message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLevel', () => {
    it('should change minimum log level', () => {
      const logger = new Logger('Test');
      logger.setLevel('debug');
      logger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('context', () => {
    it('should include context in log output', () => {
      const logger = new Logger('Test', { useColors: false });
      logger.info('Message', { key: 'value', num: 42 });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('key=value'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('num=42'));
    });
  });

  describe('category', () => {
    it('should include category in log output', () => {
      const logger = new Logger('MyCategory', { useColors: false });
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[MyCategory]'));
    });
  });

  describe('timestamps', () => {
    it('should include timestamp when configured', () => {
      const logger = new Logger('Test', { includeTimestamp: true, useColors: false });
      logger.info('Test message');

      // Should have time format like HH:MM:SS
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/\d{2}:\d{2}:\d{2}/));
    });
  });

  describe('JSON output', () => {
    it('should output JSON when configured', () => {
      const logger = new Logger('Test', { jsonOutput: true });
      logger.info('Test message', { key: 'value' });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('category', 'Test');
      expect(parsed).toHaveProperty('message', 'Test message');
      expect(parsed.context).toHaveProperty('key', 'value');
    });
  });

  describe('custom handler', () => {
    it('should call custom handler instead of console', () => {
      const customHandler = jest.fn();
      const logger = new Logger('Test', { customHandler });

      logger.info('Test message');

      expect(customHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          category: 'Test',
          message: 'Test message',
        })
      );
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create child with combined category', () => {
      const parent = new Logger('Parent', { useColors: false });
      const child = parent.child('Child');

      child.info('Test message');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Parent:Child]'));
    });
  });

  describe('progress', () => {
    it('should output progress summary', () => {
      const logger = new Logger('Test');
      logger.progress(5, 100, {
        url: 'https://example.com',
        pagesVisited: 3,
        findings: 2,
        recentActions: ['Click button', 'Fill form'],
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Progress Update'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('5/100'));
    });
  });

  describe('finding', () => {
    it('should output finding with severity emoji', () => {
      const logger = new Logger('Test');

      logger.finding('critical', 'Security issue');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🔴'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));

      consoleSpy.mockClear();
      logger.finding('high', 'High priority bug');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🟠'));

      consoleSpy.mockClear();
      logger.finding('medium', 'Medium issue');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🟡'));

      consoleSpy.mockClear();
      logger.finding('low', 'Minor issue');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🟢'));
    });
  });

  describe('getLogger', () => {
    it('should create logger with global config', () => {
      setGlobalLoggerConfig({ minLevel: 'debug' });
      const logger = getLogger('Test');

      logger.debug('Debug message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
