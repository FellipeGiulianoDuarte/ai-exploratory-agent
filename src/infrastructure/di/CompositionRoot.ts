import { SessionRepository } from '../../application/ports/SessionRepository';
import { ExplorationService } from '../../application/services/ExplorationService';
import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter';
import { LLMAdapterFactory } from '../llm/LLMAdapterFactory';
import { FileBasedFindingsRepository } from '../persistence/FileBasedFindingsRepository';
import { FileBasedSessionRepository } from '../persistence/FileBasedSessionRepository';
import { InMemoryEventBus } from '../events/InMemoryEventBus';
import { ConfigFactory } from '../config/ConfigFactory';
import { CLIInteractionAdapter } from '../cli/CLIInteractionAdapter';
import { ExplorationEventHandlers } from '../events/ExplorationEventHandlers';
import { BrokenImageDetectorTool } from '../tools/BrokenImageDetectorTool';
import { ConsoleErrorAnalyzerTool } from '../tools/ConsoleErrorAnalyzerTool';
import { NetworkErrorAnalyzerTool } from '../tools/NetworkErrorAnalyzerTool';
import { ScreenshotCaptureTool } from '../tools/ScreenshotCaptureTool';
import { PageContentAnalyzerTool } from '../tools/PageContentAnalyzerTool';
import { DropdownValidatorTool } from '../tools/DropdownValidatorTool';
import { AppConfig } from '../../domain/config/AppConfig';
import { ProgressReporter } from '../../application/services/ProgressReporter';

export interface ApplicationContainer {
  explorationService: ExplorationService;
  cli: CLIInteractionAdapter;
  eventHandlers: ExplorationEventHandlers;
  config: AppConfig;
  sessionRepository: SessionRepository;
  progressReporter: ProgressReporter;
}

export class CompositionRoot {
  static async initialize(
    cliOptions: { url?: string; objective?: string; sessionId?: string } = {}
  ): Promise<ApplicationContainer> {
    // 1. Load Configuration
    const config = ConfigFactory.load(cliOptions);

    // 2. Initialize Infrastructure Adapters
    const browser = new PlaywrightBrowserAdapter({
      headless: config.browser.headless,
      viewportWidth: config.browser.width,
      viewportHeight: config.browser.height,
    });

    const llm = LLMAdapterFactory.create({
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
    });

    const findingsRepository = new FileBasedFindingsRepository('./findings');
    const sessionRepository = new FileBasedSessionRepository('./sessions');
    const eventBus = new InMemoryEventBus();
    const cli = new CLIInteractionAdapter(findingsRepository);

    // 3. Initialize Domain/Application Services
    const explorationService = new ExplorationService(
      browser,
      llm,
      findingsRepository,
      eventBus,
      config
    );

    // 4. Register Tools
    explorationService.registerTool(new BrokenImageDetectorTool());
    explorationService.registerTool(new ConsoleErrorAnalyzerTool());
    explorationService.registerTool(new NetworkErrorAnalyzerTool());
    explorationService.registerTool(new ScreenshotCaptureTool());
    explorationService.registerTool(new PageContentAnalyzerTool());
    explorationService.registerTool(new DropdownValidatorTool());

    explorationService.setSessionRepository(sessionRepository);

    const progressReporter = new ProgressReporter();

    // 5. Setup Event Handling
    const eventHandlers = new ExplorationEventHandlers(eventBus, cli, progressReporter, true); // true = verbose, could be config driven
    eventHandlers.register();

    return {
      explorationService,
      cli,
      eventHandlers,
      config,
      sessionRepository,
      progressReporter,
    };
  }
}
