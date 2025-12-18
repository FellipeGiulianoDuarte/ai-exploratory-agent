import * as readline from 'readline';
import { ExplorationSession, CheckpointReason, HumanGuidance } from '../../domain/exploration/ExplorationSession';
import { ActionDecision } from '../../application/ports/LLMPort';
import { HumanInteractionCallback } from '../../application/services/ExplorationService';
import { FindingsRepository } from '../../application/ports/FindingsRepository';

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
    return new Promise((resolve) => {
      const rl = this.getReadline();
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Display a separator line.
   */
  private separator(): void {
    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  }

  /**
   * Display session summary.
   */
  private displaySessionSummary(session: ExplorationSession): void {
    const stats = session.getStats();
    
    console.log(`${colors.bold}📊 Exploration Summary${colors.reset}`);
    console.log(`   Steps completed: ${colors.cyan}${stats.totalSteps}${colors.reset}`);
    console.log(`   Current URL: ${colors.blue}${session.currentUrl}${colors.reset}`);
    console.log(`   Findings: ${colors.yellow}${stats.totalFindings}${colors.reset}`);
    console.log(`   Duration: ${colors.dim}${Math.round(stats.duration / 1000)}s${colors.reset}`);
  }

  /**
   * Display proposed action.
   */
  private displayProposedAction(decision: ActionDecision): void {
    console.log(`\n${colors.bold}🎯 Proposed Next Action${colors.reset}`);
    console.log(`   Action: ${formatAction(decision)}`);
    console.log(`   Confidence: ${this.formatConfidence(decision.confidence)}`);
    console.log(`   Reasoning: ${colors.dim}${decision.reasoning}${colors.reset}`);
    
    if (decision.hypothesis) {
      console.log(`   Hypothesis: ${colors.dim}${decision.hypothesis}${colors.reset}`);
    }
    if (decision.expectedOutcome) {
      console.log(`   Expected: ${colors.dim}${decision.expectedOutcome}${colors.reset}`);
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

    console.log(`\n${colors.bold}📜 Recent Actions${colors.reset}`);
    for (const entry of recent) {
      const status = entry.success 
        ? `${colors.green}✓${colors.reset}` 
        : `${colors.red}✗${colors.reset}`;
      console.log(`   ${status} Step ${entry.step}: ${formatAction(entry.action)}`);
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
    
    console.log(`${colors.bold}${colors.yellow}⚡ CHECKPOINT${colors.reset}`);
    console.log(`   Reason: ${formatCheckpointReason(reason)}`);
    
    this.displaySessionSummary(session);
    this.displayRecentHistory(session);
    
    if (proposedAction) {
      this.displayProposedAction(proposedAction);
    }

    console.log(`\n${colors.bold}Options:${colors.reset}`);
    console.log(`   ${colors.green}[c]${colors.reset} Continue exploration`);
    console.log(`   ${colors.yellow}[g]${colors.reset} Provide guidance`);
    console.log(`   ${colors.red}[s]${colors.reset} Stop exploration`);
    console.log(`   ${colors.blue}[d]${colors.reset} Show detailed findings`);

    while (true) {
      const input = await this.prompt(`\n${colors.bold}Your choice: ${colors.reset}`);
      const choice = input.toLowerCase();

      switch (choice) {
        case 'c':
        case 'continue':
          return { action: 'continue' };

        case 'g':
        case 'guidance':
          const guidance = await this.prompt(
            `${colors.cyan}Enter guidance for the agent: ${colors.reset}`
          );
          if (guidance) {
            console.log(`${colors.green}✓ Guidance recorded${colors.reset}`);
            return { action: 'continue', guidance };
          }
          console.log(`${colors.yellow}No guidance provided, continuing...${colors.reset}`);
          return { action: 'continue' };

        case 's':
        case 'stop':
          const stopReason = await this.prompt(
            `${colors.cyan}Reason for stopping (optional): ${colors.reset}`
          );
          console.log(`${colors.dim}Stopping: ${stopReason || 'User stopped exploration'}${colors.reset}`);
          return { action: 'stop' };

        case 'd':
        case 'details':
          await this.displayDetailedFindings(session);
          break;

        default:
          console.log(`${colors.red}Invalid option. Please enter c, g, s, or d.${colors.reset}`);
      }
    }
  }

  /**
   * Display detailed findings.
   */
  private async displayDetailedFindings(session: ExplorationSession): Promise<void> {
    const stats = session.getStats();
    
    console.log(`\n${colors.bold}🔍 Detailed Findings${colors.reset}`);
    
    if (stats.totalFindings === 0) {
      console.log(`   ${colors.dim}No findings recorded yet.${colors.reset}`);
      return;
    }

    // If we have a findings repository, fetch and display full finding details
    if (this.findingsRepository) {
      const findings = await this.findingsRepository.findBySessionId(session.id);
      
      if (findings.length === 0) {
        console.log(`   ${colors.dim}No findings recorded yet.${colors.reset}`);
        return;
      }

      for (const finding of findings) {
        console.log(`\n${finding.summarize()}`);
      }
    } else {
      // Fallback: display finding IDs from session history
      const history = session.getHistoryForLLM();
      const allFindings = history.flatMap(h => h.findings || []);
      
      for (const finding of allFindings) {
        console.log(`   • ${finding}`);
      }
    }
  }

  /**
   * Display a message to the user.
   */
  displayMessage(message: string): void {
    console.log(message);
  }

  /**
   * Display exploration start message.
   */
  displayStart(url: string, objective: string): void {
    this.separator();
    console.log(`${colors.bold}${colors.green}🚀 Starting Exploration${colors.reset}`);
    console.log(`   Target: ${colors.blue}${url}${colors.reset}`);
    console.log(`   Objective: ${colors.dim}${objective}${colors.reset}`);
    this.separator();
  }

  /**
   * Display exploration end message.
   */
  displayEnd(result: {
    totalSteps: number;
    findings: number;
    duration: number;
    reason: string;
  }): void {
    this.separator();
    console.log(`${colors.bold}${colors.green}✅ Exploration Complete${colors.reset}`);
    console.log(`   Total steps: ${colors.cyan}${result.totalSteps}${colors.reset}`);
    console.log(`   Findings: ${colors.yellow}${result.findings}${colors.reset}`);
    console.log(`   Duration: ${colors.dim}${Math.round(result.duration / 1000)}s${colors.reset}`);
    console.log(`   Stopped: ${colors.dim}${result.reason}${colors.reset}`);
    this.separator();
  }

  /**
   * Display a step being executed.
   */
  displayStep(stepNumber: number, action: ActionDecision): void {
    const status = `${colors.dim}[Step ${stepNumber}]${colors.reset}`;
    console.log(`${status} ${formatAction(action)}`);
  }

  /**
   * Display a finding being discovered.
   */
  displayFinding(_type: string, severity: string, title: string): void {
    let severityColor = colors.dim;
    switch (severity) {
      case 'critical': severityColor = colors.red; break;
      case 'high': severityColor = colors.yellow; break;
      case 'medium': severityColor = colors.cyan; break;
      case 'low': severityColor = colors.dim; break;
    }
    
    console.log(`   ${colors.yellow}🔎 Found:${colors.reset} ${severityColor}[${severity}]${colors.reset} ${title}`);
  }
}
