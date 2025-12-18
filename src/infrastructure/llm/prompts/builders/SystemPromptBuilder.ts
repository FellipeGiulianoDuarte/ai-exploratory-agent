/**
 * Builder for composing system prompts from modular sections.
 * Enables flexible, testable, and maintainable prompt construction.
 */

import { ROLE_SECTION } from '../sections/role';
import { RESPONSIBILITIES_SECTION } from '../sections/responsibilities';
import { BUG_PRIORITIES_SECTION } from '../sections/bug-priorities';
import { EXPLORATION_STRATEGY_SECTION } from '../sections/exploration-strategy';
import { DECISION_GUIDELINES_SECTION } from '../sections/decision-guidelines';
import { TOOL_USAGE_SECTION } from '../sections/tool-usage';
import { REPORTING_GUIDELINES_SECTION } from '../sections/reporting-guidelines';
import { CONFIDENCE_SCORING_SECTION } from '../sections/confidence-scoring';
import { OUTPUT_FORMAT_SECTION } from '../sections/output-format';

/**
 * Fluent builder for constructing system prompts.
 *
 * Example:
 * ```typescript
 * const prompt = new SystemPromptBuilder()
 *   .addRole()
 *   .addResponsibilities()
 *   .addBugPriorities()
 *   .build();
 * ```
 */
export class SystemPromptBuilder {
  private sections: string[] = [];

  /**
   * Add the role section (agent identity).
   */
  addRole(): this {
    this.sections.push(ROLE_SECTION);
    return this;
  }

  /**
   * Add the responsibilities section (what the agent does).
   */
  addResponsibilities(): this {
    this.sections.push(RESPONSIBILITIES_SECTION);
    return this;
  }

  /**
   * Add the bug priorities section (what to look for).
   */
  addBugPriorities(): this {
    this.sections.push(BUG_PRIORITIES_SECTION);
    return this;
  }

  /**
   * Add the exploration strategy section (phases of exploration).
   */
  addExplorationStrategy(): this {
    this.sections.push(EXPLORATION_STRATEGY_SECTION);
    return this;
  }

  /**
   * Add the decision guidelines section (how to decide).
   */
  addDecisionGuidelines(): this {
    this.sections.push(DECISION_GUIDELINES_SECTION);
    return this;
  }

  /**
   * Add the tool usage section (when to use tools).
   */
  addToolUsage(): this {
    this.sections.push(TOOL_USAGE_SECTION);
    return this;
  }

  /**
   * Add the reporting guidelines section (when to report findings).
   */
  addReportingGuidelines(): this {
    this.sections.push(REPORTING_GUIDELINES_SECTION);
    return this;
  }

  /**
   * Add the confidence scoring section (how to rate confidence).
   */
  addConfidenceScoring(): this {
    this.sections.push(CONFIDENCE_SCORING_SECTION);
    return this;
  }

  /**
   * Add the output format section (expected JSON structure).
   */
  addOutputFormat(): this {
    this.sections.push(OUTPUT_FORMAT_SECTION);
    return this;
  }

  /**
   * Add a custom section.
   */
  addCustomSection(section: string): this {
    if (section && section.trim()) {
      this.sections.push(section);
    }
    return this;
  }

  /**
   * Build the final system prompt.
   */
  build(): string {
    return this.sections.filter(Boolean).join('\n\n');
  }

  /**
   * Get the default system prompt (all sections).
   * This is equivalent to the original SYSTEM_PROMPT.
   */
  static buildDefault(): string {
    return new SystemPromptBuilder()
      .addRole()
      .addResponsibilities()
      .addBugPriorities()
      .addExplorationStrategy()
      .addDecisionGuidelines()
      .addToolUsage()
      .addReportingGuidelines()
      .addConfidenceScoring()
      .addOutputFormat()
      .build();
  }

  /**
   * Build a minimal system prompt (core sections only).
   * Useful for testing or token-constrained scenarios.
   */
  static buildMinimal(): string {
    return new SystemPromptBuilder().addRole().addResponsibilities().addOutputFormat().build();
  }

  /**
   * Build a discovery-focused prompt (early exploration phase).
   */
  static buildForDiscovery(): string {
    return new SystemPromptBuilder()
      .addRole()
      .addResponsibilities()
      .addExplorationStrategy()
      .addDecisionGuidelines()
      .addToolUsage()
      .addOutputFormat()
      .build();
  }

  /**
   * Build a bug-hunting focused prompt (interaction phase).
   */
  static buildForBugHunting(): string {
    return new SystemPromptBuilder()
      .addRole()
      .addResponsibilities()
      .addBugPriorities()
      .addDecisionGuidelines()
      .addToolUsage()
      .addReportingGuidelines()
      .addConfidenceScoring()
      .addOutputFormat()
      .build();
  }

  /**
   * Build a verification-focused prompt (confirmation phase).
   */
  static buildForVerification(): string {
    return new SystemPromptBuilder()
      .addRole()
      .addResponsibilities()
      .addBugPriorities()
      .addReportingGuidelines()
      .addConfidenceScoring()
      .addOutputFormat()
      .build();
  }
}
