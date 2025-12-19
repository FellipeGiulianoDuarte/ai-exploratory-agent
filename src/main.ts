import { CompositionRoot } from './infrastructure/di/CompositionRoot';
import { ReportGenerator } from './application/services/ReportGenerator';
import { TestGeneratorService } from './application/services/TestGeneratorService';
import { getLogger } from './infrastructure/logging/Logger';

/**
 * Main entry point for the AI Exploratory Agent.
 */
async function main(): Promise<void> {
  // Parse command-line arguments using CLIInputParser
  const { CLIInputParser } = await import('./infrastructure/cli/CLIInputParser');
  const options = CLIInputParser.parse(process.argv.slice(2));
  const logger = getLogger('Main');

  if (options.help) {
    // eslint-disable-next-line no-console
    console.log(CLIInputParser.getHelpText());
    process.exit(0);
  }

  // Use parsed options
  const cliTargetUrl = options.url;
  const cliObjective = options.objective;

  try {
    // Initialize Application
    const container = await CompositionRoot.initialize({
      url: cliTargetUrl,
      objective: cliObjective,
    });

    const { explorationService, config, sessionRepository } = container;

    // Execute Exploration
    const result = await explorationService.explore(
      config.exploration.url,
      config.exploration.objective
    );

    // Generate markdown report

    // Generate markdown report
    const reportGenerator = new ReportGenerator({ outputDir: './reports' });
    const reportPath = await reportGenerator.generateReport(
      {
        sessionId: result.sessionId,
        targetUrl: config.exploration.url,
        objective: config.exploration.objective,
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
    logger.info(`\n📄 Report generated: ${reportPath}`);

    // Generate Playwright regression tests
    if (result.findings.length > 0) {
      const testGenerator = new TestGeneratorService({
        outputDir: './generated-tests',
        baseUrl: config.exploration.url,
      });

      const testResult = await testGenerator.generateTests(result.findings, result.sessionId);
      logger.info(`\n🧪 Tests generated: ${testResult.filePath}`);
    }

    logger.info(
      `\n💾 Session saved to: ${sessionRepository.getBaseDir()}/${result.sessionId}.json`
    );

    process.exit(0);
  } catch (error) {
    logger.error('\n❌ Exploration failed:', { error });
    process.exit(1);
  }
}

// Run main
main().catch(console.error);
