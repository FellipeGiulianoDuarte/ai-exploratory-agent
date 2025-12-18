import OpenAI from 'openai';
import {
  LLMPort,
  LLMResponse,
  LLMDecisionRequest,
  LLMCompletionOptions,
  LLMPageContext,
  ActionDecision,
  ExplorationHistoryEntry,
} from '../../application/ports/LLMPort';
import { SYSTEM_PROMPT, buildDecisionPrompt, buildDecisionPromptWithPersonas, FINDING_ANALYSIS_PROMPT, SUMMARY_PROMPT } from './prompts';

/**
 * Configuration for OpenAIAdapter.
 */
export interface OpenAIAdapterConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

/**
 * OpenAI implementation of LLMPort.
 */
export class OpenAIAdapter implements LLMPort {
  private client: OpenAI;
  private modelName: string;

  constructor(config: OpenAIAdapterConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.modelName = config.model || 'gpt-4o-mini';
  }

  get provider(): string {
    return 'openai';
  }

  get model(): string {
    return this.modelName;
  }

  /**
   * Get the appropriate token limit configuration based on model type.
   * Newer models (o1, o3, gpt-5, etc.) require max_completion_tokens.
   */
  private getTokenConfig(maxTokens: number): { max_tokens?: number; max_completion_tokens?: number } {
    const usesMaxCompletionTokens = /^(o1|o3|o4|gpt-5)/.test(this.modelName);
    return usesMaxCompletionTokens
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };
  }

  async decideNextAction(
    request: LLMDecisionRequest,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Build the prompt - use persona-enhanced version if personas are provided
    const prompt = request.personaAnalysis && request.personaAnalysis.length > 0
      ? buildDecisionPromptWithPersonas(
          request.pageContext,
          request.history,
          request.tools,
          request.personaAnalysis,
          request.objective,
          request.urlQueueContext,
          request.reportedBugsSummary
        )
      : buildDecisionPrompt(
          request.pageContext,
          request.history,
          request.tools,
          request.objective,
          request.urlQueueContext,
          request.reportedBugsSummary
        );

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: options?.temperature ?? 0.7,
        ...this.getTokenConfig(options?.maxTokens ?? 4096),
        stop: options?.stopSequences,
      });

      const text = response.choices[0]?.message?.content || '';

      // Parse the decision
      const decision = this.parseDecision(text);

      // Get token usage
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        decision,
        rawResponse: text,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeFinding(finding: string, context: LLMPageContext): Promise<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
  }> {
    const prompt = FINDING_ANALYSIS_PROMPT
      .replace('{{FINDING}}', finding)
      .replace('{{PAGE_URL}}', context.url)
      .replace('{{PAGE_TITLE}}', context.title);

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        ...this.getTokenConfig(1024),
      });

      const text = response.choices[0]?.message?.content || '';

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          severity: parsed.severity || 'medium',
          description: parsed.description || finding,
          recommendation: parsed.recommendation || 'Review and fix the issue',
        };
      }

      // Fallback if parsing fails
      return {
        severity: 'medium',
        description: finding,
        recommendation: 'Review and address this finding',
      };
    } catch {
      // Return safe fallback
      return {
        severity: 'medium',
        description: finding,
        recommendation: 'Review and address this finding',
      };
    }
  }

  async generateSummary(history: ExplorationHistoryEntry[], findings: string[]): Promise<string> {
    // Calculate statistics from history
    const totalSteps = history.length;
    const successfulActions = history.filter(h => h.success).length;
    const failedActions = history.filter(h => !h.success).length;
    const pagesVisited = new Set(history.map(h => h.resultingUrl)).size;

    const findingsText = findings.length > 0 ? findings.join('\n') : 'No issues found';

    const prompt = SUMMARY_PROMPT
      .replace('{{totalSteps}}', String(totalSteps))
      .replace('{{successfulActions}}', String(successfulActions))
      .replace('{{failedActions}}', String(failedActions))
      .replace('{{pagesVisited}}', String(pagesVisited))
      .replace('{{findings}}', findingsText);

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        ...this.getTokenConfig(2048),
      });

      return response.choices[0]?.message?.content || 'Summary generation failed';
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        ...this.getTokenConfig(10),
      });
      return !!response.choices[0]?.message?.content;
    } catch {
      return false;
    }
  }

  /**
   * Parse the LLM response to extract ActionDecision.
   */
  private parseDecision(text: string): ActionDecision {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.action) {
        throw new Error('Missing required field: action');
      }

      return {
        action: parsed.action,
        selector: parsed.selector,
        value: parsed.value,
        toolName: parsed.toolName,
        toolParams: parsed.toolParams,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
        confidenceFactors: parsed.confidenceFactors,
        alternatives: parsed.alternatives,
        hypothesis: parsed.hypothesis,
        expectedOutcome: parsed.expectedOutcome,
        observedIssues: parsed.observedIssues,
      };
    } catch (error) {
      throw new Error(`Failed to parse action decision: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
