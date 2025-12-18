/**
 * Loop Detection Service
 *
 * Detects repetitive action patterns and tool execution loops
 * during exploration to prevent infinite cycles.
 */

import { getLogger } from '../../infrastructure/logging/Logger';
import { ActionDecision } from '../../domain/exploration/ActionTypes';

const logger = getLogger('LoopDetection');

export interface LoopDetectionConfig {
  /** Number of recent tool calls to track (default: 10) */
  toolHistorySize: number;
  /** Number of identical tool calls to trigger detection (default: 3) */
  toolLoopThreshold: number;
  /** Number of recent actions to track (default: 20) */
  actionHistorySize: number;
  /** Number of identical actions to trigger detection (default: 4) */
  actionLoopThreshold: number;
}

export const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  toolHistorySize: 10,
  toolLoopThreshold: 3,
  actionHistorySize: 20,
  actionLoopThreshold: 4,
};

export interface LoopDetectionResult {
  isLoop: boolean;
  type?: 'tool' | 'action';
  pattern?: string;
  count?: number;
}

/**
 * Service for detecting repetitive patterns in exploration actions.
 */
export class LoopDetectionService {
  private readonly config: LoopDetectionConfig;
  private recentToolCalls: string[] = [];
  private recentActions: string[] = [];

  constructor(config: Partial<LoopDetectionConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  }

  /**
   * Record a tool execution.
   */
  recordToolCall(toolName: string, params?: Record<string, unknown>): void {
    const signature = this.getToolSignature(toolName, params);
    this.recentToolCalls.push(signature);

    // Keep only recent history
    if (this.recentToolCalls.length > this.config.toolHistorySize) {
      this.recentToolCalls.shift();
    }
  }

  /**
   * Record an action execution.
   */
  recordAction(decision: ActionDecision): void {
    const signature = this.getActionSignature(decision);
    this.recentActions.push(signature);

    // Keep only recent history
    if (this.recentActions.length > this.config.actionHistorySize) {
      this.recentActions.shift();
    }
  }

  /**
   * Check if a tool call would create a loop.
   */
  detectToolLoop(toolName: string, params?: Record<string, unknown>): LoopDetectionResult {
    const signature = this.getToolSignature(toolName, params);
    const matchCount = this.recentToolCalls.filter(t => t === signature).length;

    if (matchCount >= this.config.toolLoopThreshold - 1) {
      logger.warn(`Tool loop detected: ${toolName} called ${matchCount + 1} times`, {
        signature,
        threshold: this.config.toolLoopThreshold,
      });
      return {
        isLoop: true,
        type: 'tool',
        pattern: signature,
        count: matchCount + 1,
      };
    }

    return { isLoop: false };
  }

  /**
   * Check if an action would create a loop.
   */
  detectActionLoop(decision: ActionDecision): LoopDetectionResult {
    const signature = this.getActionSignature(decision);
    const matchCount = this.recentActions.filter(a => a === signature).length;

    if (matchCount >= this.config.actionLoopThreshold - 1) {
      logger.warn(`Action loop detected: ${decision.action} performed ${matchCount + 1} times`, {
        signature,
        threshold: this.config.actionLoopThreshold,
      });
      return {
        isLoop: true,
        type: 'action',
        pattern: signature,
        count: matchCount + 1,
      };
    }

    return { isLoop: false };
  }

  /**
   * Check for any type of loop.
   */
  detectLoop(decision: ActionDecision): LoopDetectionResult {
    // Check tool loops first for tool actions
    if (decision.action === 'tool' && decision.toolName) {
      const toolResult = this.detectToolLoop(decision.toolName, decision.toolParams);
      if (toolResult.isLoop) {
        return toolResult;
      }
    }

    // Check action loops
    return this.detectActionLoop(decision);
  }

  /**
   * Clear all recorded history.
   */
  reset(): void {
    this.recentToolCalls = [];
    this.recentActions = [];
    logger.debug('Loop detection history cleared');
  }

  /**
   * Clear history for a specific context (e.g., when navigating to new page).
   */
  resetActionHistory(): void {
    this.recentActions = [];
    logger.debug('Action history cleared for new context');
  }

  /**
   * Get statistics about current tracking state.
   */
  getStats(): { toolCalls: number; actions: number } {
    return {
      toolCalls: this.recentToolCalls.length,
      actions: this.recentActions.length,
    };
  }

  /**
   * Create a unique signature for a tool call.
   */
  private getToolSignature(toolName: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) {
      return toolName;
    }
    // Sort params for consistent signature
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${JSON.stringify(params[k])}`)
      .join(',');
    return `${toolName}:${sortedParams}`;
  }

  /**
   * Create a unique signature for an action.
   * Format: action:selector:value (normalized)
   */
  private getActionSignature(decision: ActionDecision): string {
    const parts: string[] = [decision.action];

    if (decision.selector) {
      parts.push(decision.selector);
    }

    if (decision.value) {
      // Normalize value to catch similar inputs
      const normalizedValue = decision.value.toLowerCase().replace(/['"]/g, '').substring(0, 50);
      parts.push(normalizedValue);
    }

    if (decision.toolName) {
      parts.push(decision.toolName);
    }

    return parts.join(':');
  }
}
