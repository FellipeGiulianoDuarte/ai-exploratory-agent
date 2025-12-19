import { AppConfig, AppConfigSchema } from './ConfigSchema';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config();

export class ConfigFactory {
  static load(cliOptions: { url?: string; objective?: string } = {}): AppConfig {
    const rawConfig = {
      exploration: {
        url: cliOptions.url || process.env.TARGET_URL,
        objective: cliOptions.objective || process.env.EXPLORATION_OBJECTIVE,
        maxSteps: process.env.MAX_STEPS ? parseInt(process.env.MAX_STEPS, 10) : undefined,
        checkpointInterval: process.env.CHECKPOINT_INTERVAL
          ? parseInt(process.env.CHECKPOINT_INTERVAL, 10)
          : undefined,
        exitAfterBugsFound: process.env.EXIT_AFTER_BUGS_FOUND
          ? parseInt(process.env.EXIT_AFTER_BUGS_FOUND, 10)
          : undefined,
        requiredTools: process.env.REQUIRED_TOOLS
          ? process.env.REQUIRED_TOOLS.split(',').map(t => t.trim())
          : undefined,
        checkpointOnToolFindings: process.env.CHECKPOINT_ON_TOOL_FINDINGS !== 'false',
        progressSummaryInterval: process.env.PROGRESS_SUMMARY_INTERVAL
          ? parseInt(process.env.PROGRESS_SUMMARY_INTERVAL, 10)
          : undefined,
      },
      navigation: {
        waitTime: process.env.NAVIGATION_WAIT_TIME
          ? parseInt(process.env.NAVIGATION_WAIT_TIME, 10)
          : undefined,
        timeout: process.env.STEP_TIMEOUT ? parseInt(process.env.STEP_TIMEOUT, 10) : undefined,
        maxQueueSize: process.env.MAX_QUEUE_SIZE
          ? parseInt(process.env.MAX_QUEUE_SIZE, 10)
          : undefined,
        scrollAmount: process.env.SCROLL_AMOUNT
          ? parseInt(process.env.SCROLL_AMOUNT, 10)
          : undefined,
      },
      llm: {
        provider: (process.env.LLM_PROVIDER as any) || 'openai',
        apiKey:
          process.env.OPENAI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.ANTHROPIC_API_KEY ||
          '',
        model: process.env.LLM_MODEL,
        minConfidence: process.env.MIN_CONFIDENCE_THRESHOLD
          ? parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD)
          : undefined,
        temperature: process.env.LLM_TEMPERATURE
          ? parseFloat(process.env.LLM_TEMPERATURE)
          : undefined,
      },
      browser: {
        headless: process.env.HEADLESS !== 'false',
        width: process.env.VIEWPORT_WIDTH ? parseInt(process.env.VIEWPORT_WIDTH, 10) : undefined,
        height: process.env.VIEWPORT_HEIGHT ? parseInt(process.env.VIEWPORT_HEIGHT, 10) : undefined,
      },
      personas: {
        enabled: process.env.ENABLE_PERSONAS !== 'false',
        maxSuggestions: process.env.MAX_SUGGESTIONS_PER_PERSONA
          ? parseInt(process.env.MAX_SUGGESTIONS_PER_PERSONA, 10)
          : undefined,
        enableSecurity: process.env.ENABLE_SECURITY_PERSONA !== 'false',
        enableMonitor: process.env.ENABLE_MONITOR_PERSONA !== 'false',
        enableValidation: process.env.ENABLE_VALIDATION_PERSONA !== 'false',
        enableChaos: process.env.ENABLE_CHAOS_PERSONA !== 'false',
        enableEdgeCase: process.env.ENABLE_EDGE_CASE_PERSONA !== 'false',
      },
      deduplication: {
        threshold: process.env.SIMILARITY_THRESHOLD
          ? parseFloat(process.env.SIMILARITY_THRESHOLD)
          : undefined,
        patternMatching: process.env.ENABLE_PATTERN_MATCHING !== 'false',
        semanticMatching: process.env.ENABLE_SEMANTIC_MATCHING !== 'false',
      },
      // Page analysis defaults are usually static but could be env-driven if needed
      pageAnalysis: {},
    };

    // Parse and validate
    const result = AppConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      const errorMsg = JSON.stringify(result.error.format(), null, 2);
      throw new Error(`Invalid Configuration:\n${errorMsg}`);
    }

    return result.data;
  }
}
