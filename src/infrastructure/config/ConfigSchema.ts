import { z } from 'zod';

export const ExplorationSchema = z.object({
  url: z.string().url().default('https://with-bugs.practicesoftwaretesting.com'),
  objective: z
    .string()
    .default(
      'Explore the web application thoroughly, looking for bugs, broken images, console errors, and usability issues.'
    ),
  maxSteps: z.number().int().positive().default(50),
  checkpointInterval: z.number().int().positive().default(10),
  exitAfterBugsFound: z.number().int().nonnegative().default(3),
  requiredTools: z.array(z.string()).default(['analyze', 'find_broken_images']),
  checkpointOnToolFindings: z.boolean().default(true),
  progressSummaryInterval: z.number().int().positive().default(5),
});

export const NavigationSchema = z.object({
  waitTime: z.number().int().nonnegative().default(2000),
  timeout: z.number().int().positive().default(30000),
  maxQueueSize: z.number().int().positive().default(100),
  scrollAmount: z.number().int().positive().default(500),
});

export const LoopDetectionSchema = z.object({
  toolHistorySize: z.number().int().positive().default(10),
  toolLoopThreshold: z.number().int().positive().default(3),
  actionHistorySize: z.number().int().positive().default(20),
  actionLoopThreshold: z.number().int().positive().default(4),
});

export const BrowserSchema = z.object({
  headless: z.boolean().default(true),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
  screenshotDir: z.string().default('./screenshots'),
});

export const LLMSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini']).default('openai'),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  minConfidence: z.number().min(0).max(1).default(0.6),
  temperature: z.number().min(0).max(1).default(0.7),
  // Resilience & Fallback
  fallbacks: z.array(z.enum(['openai', 'anthropic', 'gemini'])).default([]),
  circuitBreaker: z
    .object({
      enabled: z.boolean().default(true),
      failureThreshold: z.number().int().positive().default(5),
      resetTimeoutMs: z.number().int().positive().default(60000),
      successThreshold: z.number().int().positive().default(2),
    })
    .default({}),
});

export const PageAnalysisSchema = z.object({
  maxVisibleText: z.number().int().positive().default(5000),
  maxInteractiveElements: z.number().int().positive().default(50),
  maxLinkTextLength: z.number().int().positive().default(40),
  minActionableWords: z.number().int().positive().default(3),
  excludeSelectors: z.array(z.string()).default([]),
});

export const PersonaSchema = z.object({
  enabled: z.boolean().default(true),
  maxSuggestions: z.number().int().positive().default(5),
  enableSecurity: z.boolean().default(true),
  enableMonitor: z.boolean().default(true),
  enableValidation: z.boolean().default(true),
  enableChaos: z.boolean().default(true),
  enableEdgeCase: z.boolean().default(true),
});

export const DeduplicationSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.6),
  patternMatching: z.boolean().default(true),
  semanticMatching: z.boolean().default(true),
});

export const AppConfigSchema = z.object({
  exploration: ExplorationSchema,
  navigation: NavigationSchema,
  llm: LLMSchema,
  browser: BrowserSchema,
  pageAnalysis: PageAnalysisSchema,
  personas: PersonaSchema,
  deduplication: DeduplicationSchema,
  loopDetection: LoopDetectionSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
