import * as readline from 'readline';
import {
  ExplorationSession,
  CheckpointReason,
  HumanGuidance,
} from '../../domain/exploration/ExplorationSession';
import { ActionDecision } from '../../application/ports/LLMPort';
import { HumanInteractionCallback } from '../../application/ports/ExplorationTypes';
import { FindingsRepository } from '../../application/ports/FindingsRepository';
import { getLogger } from '../logging/Logger';

/**
 * Colors for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Format a checkpoint reason for display.
 */
function formatCheckpointReason(reason: CheckpointReason): string {
  switch (reason) {
    case 'step_count':
      return 'Periodic checkpoint reached';
    case 'tool_finding':
      return 'Issue discovered by tool';
    case 'low_confidence':
      return 'Low confidence in next action';
    case 'natural_breakpoint':
      return 'Natural exploration breakpoint';
    default:
      return 'Checkpoint triggered';
  }
}

/**
 * Format an action decision for display.
 */
function formatAction(decision: ActionDecision): string {
  let actionStr = `${colors.cyan}${decision.action}${colors.reset}`;

  if (decision.selector) {
    actionStr += ` on ${colors.yellow}${decision.selector}${colors.reset}`;
  }
  if (decision.value) {
    actionStr += ` with value "${colors.green}${decision.value}${colors.reset}"`;
  }
  if (decision.toolName) {
    actionStr += ` (tool: ${colors.magenta}${decision.toolName}${colors.reset})`;
  }

  return actionStr;
}

/**
 * CLI adapter for human-in-the-loop interactions.
 * Provides a terminal interface for checkpoints and guidance.
 */
export class CLIInteractionAdapter implements HumanInteractionCallback {
  private rl: readline.Interface | null = null;
  private findingsRepository?: FindingsRepository;
  private logger = getLogger('CLI');

  constructor(findingsRepository?: FindingsRepository) {
    this.findingsRepository = findingsRepository;
  }

  /**
   * Initialize the readline interface.
   */
  private getReadline(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return this.rl;
  }

  /**
   * Close the readline interface.
   */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Prompt the user for input.
   */
  private prompt(question: string): Promise<string> {
    return new Promise(resolve => {
      const rl = this.getReadline();
      rl.question(question, answer => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Display a separator line.
   */
  private separator(): void {
    this.logger.info(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
  }

  /**
   * Display session summary.
   */
  private displaySessionSummary(session: ExplorationSession): void {
    const stats = session.getStats();

    this.logger.info(`${colors.bold}📊 Exploration Summary${colors.reset}`);
    this.logger.info(`   Steps completed: ${colors.cyan}${stats.totalSteps}${colors.reset}`);
    this.logger.info(`   Current URL: ${colors.blue}${session.currentUrl}${colors.reset}`);
    this.logger.info(`   Findings: ${colors.yellow}${stats.totalFindings}${colors.reset}`);
    this.logger.info(
      `   Duration: ${colors.dim}${Math.round(stats.duration / 1000)}s${colors.reset}`
    );
  }

  /**
   * Display proposed action.
   */
  private displayProposedAction(decision: ActionDecision): void {
    this.logger.info(`\n${colors.bold}🎯 Proposed Next Action${colors.reset}`);
    this.logger.info(`   Action: ${formatAction(decision)}`);
    this.logger.info(`   Confidence: ${this.formatConfidence(decision.confidence)}`);
    this.logger.info(`   Reasoning: ${colors.dim}${decision.reasoning}${colors.reset}`);

    if (decision.hypothesis) {
      this.logger.info(`   Hypothesis: ${colors.dim}${decision.hypothesis}${colors.reset}`);
    }
    if (decision.expectedOutcome) {
      this.logger.info(`   Expected: ${colors.dim}${decision.expectedOutcome}${colors.reset}`);
    }
  }

  /**
   * Format confidence level with color.
   */
  private formatConfidence(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    let color = colors.green;

    if (confidence < 0.5) {
      color = colors.red;
    } else if (confidence < 0.7) {
      color = colors.yellow;
    }

    return `${color}${percentage}%${colors.reset}`;
  }

  /**
   * Display recent history.
   */
  private displayRecentHistory(session: ExplorationSession): void {
    const history = session.getHistoryForLLM();
    const recent = history.slice(-5);

    if (recent.length === 0) {
      return;
    }

    this.logger.info(`\n${colors.bold}📜 Recent Actions${colors.reset}`);
    for (const entry of recent) {
      const status = entry.success
        ? `${colors.green}✓${colors.reset}`
        : `${colors.red}✗${colors.reset}`;
      this.logger.info(`   ${status} Step ${entry.step}: ${formatAction(entry.action)}`);
    }
  }

  /**
   * Handle a checkpoint during exploration.
   */
  async onCheckpoint(
    session: ExplorationSession,
    reason: CheckpointReason,
    proposedAction?: ActionDecision
  ): Promise<HumanGuidance> {
    this.separator();

    this.logger.info(`${colors.bold}${colors.yellow}⚡ CHECKPOINT${colors.reset}`);
    this.logger.info(`   Reason: ${formatCheckpointReason(reason)}`);

    this.displaySessionSummary(session);
    this.displayRecentHistory(session);

    if (proposedAction) {
      this.displayProposedAction(proposedAction);
    }

    this.logger.info(`\n${colors.bold}Options:${colors.reset}`);
    this.logger.info(`   ${colors.green}[c]${colors.reset} Continue exploration`);
    this.logger.info(`   ${colors.yellow}[g]${colors.reset} Provide guidance`);
    this.logger.info(`   ${colors.red}[s]${colors.reset} Stop exploration`);
    this.logger.info(`   ${colors.blue}[d]${colors.reset} Show detailed findings`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const input = await this.prompt(`\n${colors.bold}Your choice: ${colors.reset}`);
      const choice = input.toLowerCase();

      switch (choice) {
        case 'c':
        case 'continue':
          return { action: 'continue' };

        case 'g':
        case 'guidance': {
          const guidance = await this.prompt(
            `${colors.cyan}Enter guidance for the agent: ${colors.reset}`
          );
          if (guidance) {
            this.logger.info(`${colors.green}✓ Guidance recorded${colors.reset}`);
            return { action: 'continue', guidance };
          }
          this.logger.info(`${colors.yellow}No guidance provided, continuing...${colors.reset}`);
          return { action: 'continue' };
        }

        case 's':
        case 'stop': {
          const stopReason = await this.prompt(
            `${colors.cyan}Reason for stopping (optional): ${colors.reset}`
          );
          this.logger.info(
            `${colors.dim}Stopping: ${stopReason || 'User stopped exploration'}${colors.reset}`
          );
          return { action: 'stop' };
        }

        case 'd':
        case 'details':
          await this.displayDetailedFindings(session);
          break;

        default:
          this.logger.error(
            `${colors.red}Invalid option. Please enter c, g, s, or d.${colors.reset}`
          );
      }
    }
  }

  /**
   * Display detailed findings.
   */
  private async displayDetailedFindings(session: ExplorationSession): Promise<void> {
    const stats = session.getStats();

    this.logger.info(`\n${colors.bold}🔍 Detailed Findings${colors.reset}`);

    if (stats.totalFindings === 0) {
      this.logger.info(`   ${colors.dim}No findings recorded yet.${colors.reset}`);
      return;
    }

    // If we have a findings repository, fetch and display full finding details
    if (this.findingsRepository) {
      const findings = await this.findingsRepository.findBySessionId(session.id);

      if (findings.length === 0) {
        this.logger.info(`   ${colors.dim}No findings recorded yet.${colors.reset}`);
        return;
      }

      for (const finding of findings) {
        this.logger.info(`\n${finding.summarize()}`);
      }
    } else {
      // Fallback: display finding IDs from session history
      const history = session.getHistoryForLLM();
      const allFindings = history.flatMap(h => h.findings || []);

      for (const finding of allFindings) {
        this.logger.info(`   • ${finding}`);
      }
    }
  }
}
