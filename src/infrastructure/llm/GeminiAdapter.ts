import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  LLMPort,
  LLMResponse,
  LLMDecisionRequest,
  LLMCompletionOptions,
  LLMPageContext,
  ActionDecision,
  ExplorationHistoryEntry,
} from '../../application/ports/LLMPort';
import {
  SYSTEM_PROMPT,
  buildDecisionPrompt,
  buildDecisionPromptWithPersonas,
  FINDING_ANALYSIS_PROMPT,
  SUMMARY_PROMPT,
} from './prompts';

/**
 * Configuration for GeminiAdapter.
 */
export interface GeminiAdapterConfig {
  apiKey: string;
  model?: string;
}

/**
 * Gemini implementation of LLMPort using Google Generative AI.
 */
export class GeminiAdapter implements LLMPort {
  private client: GoogleGenerativeAI;
  private generativeModel: GenerativeModel;
  private modelName: string;

  constructor(config: GeminiAdapterConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || 'gemini-2.5-flash-lite';
    this.generativeModel = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: SYSTEM_PROMPT,
    });
  }

  get provider(): string {
    return 'gemini';
  }

  get model(): string {
    return this.modelName;
  }

  async decideNextAction(
    request: LLMDecisionRequest,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Build the prompt - use persona-enhanced version if personas are provided
    const prompt =
      request.personaAnalysis && request.personaAnalysis.length > 0
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
      // Generate content
      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 4096,
          stopSequences: options?.stopSequences,
        },
      });

      const response = result.response;
      const text = response.text();

      // Parse the decision
      const decision = this.parseDecision(text);

      // Get token usage
      const usage = response.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };

      return {
        decision,
        rawResponse: text,
        usage: {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        latency: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(
        `Gemini API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async analyzeFinding(
    finding: string,
    context: LLMPageContext
  ): Promise<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
  }> {
    const prompt = FINDING_ANALYSIS_PROMPT.replace('{{FINDING}}', finding)
      .replace('{{PAGE_URL}}', context.url)
      .replace('{{PAGE_TITLE}}', context.title);

    try {
      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });

      const response = result.response.text();

      // Parse the JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
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
    } catch (error) {
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

    const prompt = SUMMARY_PROMPT.replace('{{totalSteps}}', String(totalSteps))
      .replace('{{successfulActions}}', String(successfulActions))
      .replace('{{failedActions}}', String(failedActions))
      .replace('{{pagesVisited}}', String(pagesVisited))
      .replace('{{findings}}', findingsText);

    try {
      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
        },
      });

      return result.response.text();
    } catch (error) {
      throw new Error(
        `Gemini API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try a simple test generation
      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Say "ok"' }] }],
        generationConfig: { maxOutputTokens: 10 },
      });
      return !!result.response.text();
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
      throw new Error(
        `Failed to parse action decision: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
