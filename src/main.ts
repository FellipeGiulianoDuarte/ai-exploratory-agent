import * as dotenv from 'dotenv';
import { PlaywrightBrowserAdapter } from './infrastructure/browser/PlaywrightBrowserAdapter';
import { LLMAdapterFactory, LLMProvider } from './infrastructure/llm/LLMAdapterFactory';
import { FileBasedFindingsRepository } from './infrastructure/persistence/FileBasedFindingsRepository';
import { FileBasedSessionRepository } from './infrastructure/persistence/FileBasedSessionRepository';
import { InMemoryEventBus } from './infrastructure/events/InMemoryEventBus';
import { CLIInteractionAdapter } from './infrastructure/cli/CLIInteractionAdapter';
import { ExplorationEventHandlers } from './infrastructure/events/ExplorationEventHandlers';
import { ExplorationService } from './application/services/ExplorationService';
import { ReportGenerator } from './application/services/ReportGenerator';
import { TestGeneratorService } from './application/services/TestGeneratorService';
import { BrokenImageDetectorTool } from './infrastructure/tools/BrokenImageDetectorTool';
import { ConsoleErrorAnalyzerTool } from './infrastructure/tools/ConsoleErrorAnalyzerTool';
import { NetworkErrorAnalyzerTool } from './infrastructure/tools/NetworkErrorAnalyzerTool';
import { ScreenshotCaptureTool } from './infrastructure/tools/ScreenshotCaptureTool';
import { PageContentAnalyzerTool } from './infrastructure/tools/PageContentAnalyzerTool';
import { DropdownValidatorTool } from './infrastructure/tools/DropdownValidatorTool';
import { HumanGuidance } from './domain/exploration/ExplorationSession';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the AI Exploratory Agent.
 */
async function main(): Promise<void> {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let cliTargetUrl: string | undefined;
  let cliObjective: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      cliTargetUrl = args[i + 1];
      i++;
    } else if (args[i] === '--objective' && args[i + 1]) {
      cliObjective = args[i + 1];
      i++;
    }
  }

  // If a positional argument (first non-flag) was provided, prefer it as the target URL
  const positionalArg = args.find(a => !a.startsWith('-'));

  // Get configuration from command-line args (flag or positional), then environment, then defaults
  const targetUrl = cliTargetUrl || positionalArg || process.env.TARGET_URL || 'https://with-bugs.practicesoftwaretesting.com';
  const objective = cliObjective || process.env.EXPLORATION_OBJECTIVE || 
    'Explore the web application thoroughly, looking for bugs, broken images, console errors, and usability issues.';
  const maxSteps = parseInt(process.env.MAX_STEPS || '50', 10);
  const checkpointInterval = parseInt(process.env.CHECKPOINT_INTERVAL || '10', 10);
  const progressSummaryInterval = parseInt(process.env.PROGRESS_SUMMARY_INTERVAL || '5', 10);
  const stepTimeout = parseInt(process.env.STEP_TIMEOUT || '30000', 10);
  const navigationWaitTime = parseInt(process.env.NAVIGATION_WAIT_TIME || '2000', 10);
  const minConfidenceThreshold = parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.6');
  const checkpointOnToolFindings = process.env.CHECKPOINT_ON_TOOL_FINDINGS !== 'false';
  const enablePersonas = process.env.ENABLE_PERSONAS !== 'false';
  const maxSuggestionsPerPersona = parseInt(process.env.MAX_SUGGESTIONS_PER_PERSONA || '5', 10);
  const actionLoopMaxRepetitions = parseInt(process.env.ACTION_LOOP_MAX_REPETITIONS || '2', 10);

  // Individual persona configuration
  const personaConfig = {
    enableSecurity: process.env.ENABLE_SECURITY_PERSONA !== 'false',
    enableMonitor: process.env.ENABLE_MONITOR_PERSONA !== 'false',
    enableValidation: process.env.ENABLE_VALIDATION_PERSONA !== 'false',
    enableChaos: process.env.ENABLE_CHAOS_PERSONA !== 'false',
    enableEdgeCase: process.env.ENABLE_EDGE_CASE_PERSONA !== 'false',
  };
  
  // Page exploration context configuration
  const maxActionsPerPage = parseInt(process.env.MAX_ACTIONS_PER_PAGE || '8', 10);
  const maxTimePerPage = parseInt(process.env.MAX_TIME_PER_PAGE || '60000', 10);
  const minElementInteractions = parseInt(process.env.MIN_ELEMENT_INTERACTIONS || '3', 10);
  const exitAfterBugsFound = parseInt(process.env.EXIT_AFTER_BUGS_FOUND || '3', 10);
  const requiredTools = (process.env.REQUIRED_TOOLS || 'analyze,find_broken_images').split(',').map(t => t.trim());
  
  // Bug deduplication configuration
  const similarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.6');
  const enablePatternMatching = process.env.ENABLE_PATTERN_MATCHING !== 'false';
  const enableSemanticMatching = process.env.ENABLE_SEMANTIC_MATCHING !== 'false';
  
  // LLM configuration
  const llmProvider = (process.env.LLM_PROVIDER || 'openai') as LLMProvider;
  const llmApiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const llmModel = process.env.LLM_MODEL;
  
  // Browser configuration
  const headless = process.env.HEADLESS !== 'false';
  const verbose = process.env.VERBOSE === 'true';

  console.log('\n🤖 AI Exploratory Agent\n');
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Max Steps: ${maxSteps}`);
  console.log(`Checkpoint Interval: ${checkpointInterval}`);
  console.log(`Headless: ${headless}`);
  console.log(`LLM Provider: ${llmProvider}`);
  console.log(`Verbose: ${verbose}\n`);

  // Create infrastructure components
  const browser = new PlaywrightBrowserAdapter({ headless });
  const llm = LLMAdapterFactory.create({
    provider: llmProvider,
    apiKey: llmApiKey,
    model: llmModel,
  });
  const findingsRepository = new FileBasedFindingsRepository('./findings');
  const sessionRepository = new FileBasedSessionRepository('./sessions');
  const eventBus = new InMemoryEventBus();
  const cli = new CLIInteractionAdapter(findingsRepository);

  console.log(`📂 Session storage: ${sessionRepository.getBaseDir()}\n`);

  // Wire up event handlers
  const eventHandlers = new ExplorationEventHandlers(eventBus, cli, verbose);
  eventHandlers.register();

  // Create exploration service
  const explorationService = new ExplorationService(
    browser,
    llm,
    findingsRepository,
    eventBus,
    {
      maxSteps,
      checkpointInterval,
      defaultObjective: objective,
      progressSummaryInterval,
      maxSuggestionsPerPersona,
      navigationWaitTime,
      minConfidenceThreshold,
      checkpointOnToolFindings,
      enablePersonas,
      personaConfig,
      stepTimeout,
      maxActionsPerPage,
      maxTimePerPage,
      minElementInteractions,
      exitAfterBugsFound,
      requiredTools,
      similarityThreshold,
      enablePatternMatching,
      enableSemanticMatching,
      actionLoopMaxRepetitions,
    }
  );

  // Register tools (HIGH priority tools for enhanced bug detection)
  explorationService.registerTool(new BrokenImageDetectorTool());
  explorationService.registerTool(new ConsoleErrorAnalyzerTool());
  explorationService.registerTool(new NetworkErrorAnalyzerTool());
  explorationService.registerTool(new ScreenshotCaptureTool());
  explorationService.registerTool(new PageContentAnalyzerTool());
  explorationService.registerTool(new DropdownValidatorTool());

  console.log('✅ Registered 6 tools for exploration\n');

  // Set up session repository for auto-saving
  explorationService.setSessionRepository(sessionRepository);

  // Set up human interaction callback
  explorationService.setHumanCallback({
    onCheckpoint: async (session, reason, proposedAction): Promise<HumanGuidance> => {
      return await cli.onCheckpoint(session, reason, proposedAction);
    },
  });

  try {
    // Run exploration
    cli.displayStart(targetUrl, objective);
    const result = await explorationService.explore(targetUrl, objective);

    // Display results
    cli.displayEnd({
      totalSteps: result.totalSteps,
      findings: result.findings.length,
      duration: result.duration,
      reason: result.stoppedReason,
    });

    // Print summary
    console.log('\n📝 Exploration Summary\n');
    console.log(result.summary);

    // Print findings
    if (result.findings.length > 0) {
      console.log('\n🔍 Findings\n');
      for (const finding of result.findings) {
        console.log(finding.summarize());
      }
    }
    
    // Print token usage
    const tokenUsage = explorationService.getTokenUsage();
    console.log('\n📊 Token Usage');
    console.log('─'.repeat(40));
    console.log(`Prompt Tokens:     ${tokenUsage.promptTokens.toLocaleString()}`);
    console.log(`Completion Tokens: ${tokenUsage.completionTokens.toLocaleString()}`);
    console.log(`Total Tokens:      ${tokenUsage.totalTokens.toLocaleString()}`);
    console.log('─'.repeat(40));

    // Generate markdown report
    const reportGenerator = new ReportGenerator({ outputDir: './reports' });
    
    const reportPath = await reportGenerator.generateReport(
      {
        sessionId: result.sessionId,
        targetUrl,
        objective,
        totalSteps: result.totalSteps,
        duration: result.duration,
        stoppedReason: result.stoppedReason,
        pagesVisited: result.pagesVisited,
        tokenUsage: result.tokenUsage,
      },
      result.findings,
      result.history,
      result.summary
    );
    
    console.log(`\n📄 Report generated: ${reportPath}`);

    // Generate Playwright regression tests
    if (result.findings.length > 0) {
      const testGenerator = new TestGeneratorService({
        outputDir: './generated-tests',
        baseUrl: targetUrl,
      });

      const testResult = await testGenerator.generateTests(
        result.findings,
        result.sessionId
      );

      console.log(`\n🧪 Tests generated: ${testResult.filePath}`);
      console.log(`   - ${testResult.testCount} tests created`);
      console.log(`   - ${testResult.excludedFindings.length} findings excluded (not suitable for automation)`);
    }

    console.log(`\n💾 Session saved to: ${sessionRepository.getBaseDir()}/${result.sessionId}.json`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Exploration failed:', error);
    process.exit(1);
  } finally {
    cli.close();
    eventHandlers.unregister();
  }
}

// Run main
main().catch(console.error);
