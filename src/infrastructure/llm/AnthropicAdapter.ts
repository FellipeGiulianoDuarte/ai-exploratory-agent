import Anthropic from '@anthropic-ai/sdk';
import {
  LLMPort,
  ActionDecision,
  LLMPageContext,
  ExplorationHistoryEntry,
  LLMDecisionRequest,
  LLMResponse,
  LLMCompletionOptions,
} from '../../application/ports/LLMPort';
import { SYSTEM_PROMPT, buildDecisionPrompt, FINDING_ANALYSIS_PROMPT, SUMMARY_PROMPT } from './prompts';

/**
 * Configuration for the Anthropic adapter.
 */
export interface AnthropicAdapterConfig {
  /** API key for Anthropic */
  apiKey: string;
  /** Model to use */
  model?: string;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Default temperature */
  defaultTemperature?: number;
}

/**
 * Anthropic Claude implementation of the LLM port.
 */
export class AnthropicAdapter implements LLMPort {
  readonly provider = 'anthropic';
  readonly model: string;

  private client: Anthropic;
  private config: Required<AnthropicAdapterConfig>;

  constructor(config: AnthropicAdapterConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'claude-sonnet-4-20250514',
      defaultMaxTokens: config.defaultMaxTokens ?? 1024,
      defaultTemperature: config.defaultTemperature ?? 0.7,
    };

    this.model = this.config.model;

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Request a decision for the next exploration action.
   */
  async decideNextAction(
    request: LLMDecisionRequest,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Build the user prompt
    const userPrompt = buildDecisionPrompt(
      request.pageContext,
      request.history.map(h => ({
        step: h.step,
        action: h.action,
        success: h.success,
        resultingUrl: h.resultingUrl,
      })),
      request.tools.map(t => ({ name: t.name, description: t.description })),
      request.objective,
      request.urlQueueContext,
      request.reportedBugsSummary
    );

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.defaultMaxTokens,
        temperature: options?.temperature ?? this.config.defaultTemperature,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const latency = Date.now() - startTime;

      // Extract text content from response
      const textContent = response.content.find(c => c.type === 'text');
      const rawResponse = textContent?.type === 'text' ? textContent.text : '';

      // Parse the decision from the response
      const decision = this.parseDecision(rawResponse);

      return {
        decision,
        rawResponse,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        latency,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic API error: ${errorMessage}`);
    }
  }

  /**
   * Analyze a finding for severity and description.
   */
  async analyzeFinding(
    finding: string,
    context: LLMPageContext
  ): Promise<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
  }> {
    const prompt = FINDING_ANALYSIS_PROMPT
      .replace('{{finding}}', finding)
      .replace('{{url}}', context.url)
      .replace('{{title}}', context.title);

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const rawResponse = textContent?.type === 'text' ? textContent.text : '';

    try {
      const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;
      const parsed = JSON.parse(jsonStr) as {
        severity: 'critical' | 'high' | 'medium' | 'low';
        description: string;
        recommendation: string;
      };
      return parsed;
    } catch {
      return {
        severity: 'medium',
        description: finding,
        recommendation: 'Manual review recommended',
      };
    }
  }

  /**
   * Generate a summary of exploration session.
   */
  async generateSummary(
    history: ExplorationHistoryEntry[],
    findings: string[]
  ): Promise<string> {
    const successfulActions = history.filter(h => h.success).length;
    const failedActions = history.filter(h => !h.success).length;
    const pagesVisited = new Set(history.map(h => h.resultingUrl)).size;

    const prompt = SUMMARY_PROMPT
      .replace('{{totalSteps}}', String(history.length))
      .replace('{{successfulActions}}', String(successfulActions))
      .replace('{{failedActions}}', String(failedActions))
      .replace('{{pagesVisited}}', String(pagesVisited))
      .replace('{{findings}}', findings.length > 0 ? findings.join('\n- ') : 'No findings');

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 1024,
      temperature: 0.5,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.type === 'text' ? textContent.text : 'Unable to generate summary';
  }

  /**
   * Check if the LLM is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Simple test request
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Say "ok"',
          },
        ],
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Parse the decision from LLM response.
   */
  private parseDecision(response: string): ActionDecision {
    // Try to extract JSON from the response
    let jsonStr = response;

    // Look for JSON in code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonStr = objectMatch[0];
      }
    }

    try {
      const parsed = JSON.parse(jsonStr) as Partial<ActionDecision>;

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
        reasoning: parsed.reasoning ?? 'No reasoning provided',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        confidenceFactors: parsed.confidenceFactors,
        alternatives: parsed.alternatives,
        hypothesis: parsed.hypothesis,
        expectedOutcome: parsed.expectedOutcome,
      };
    } catch (parseError) {
      // If parsing fails, create a default decision
      return {
        action: 'done',
        reasoning: `Failed to parse LLM response: ${response.substring(0, 200)}`,
        confidence: 0.1,
        confidenceFactors: ['Parse error'],
      };
    }
  }
}
