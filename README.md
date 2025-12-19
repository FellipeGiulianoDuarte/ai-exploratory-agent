# AI Exploratory Testing Agent

An intelligent, autonomous testing agent that explores web applications to discover bugs, usability issues, and unexpected behaviors using AI-powered decision-making and browser automation.

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)

## Overview

This agent autonomously explores web applications like a human tester would, but with the analytical capabilities of AI. It:

- **Discovers bugs** by reading page content, checking for typos, undefined values, and broken features
- **Tests functionality** by interacting with forms, buttons, dropdowns, and navigation
- **Monitors health** by tracking console errors, network failures, and broken images
- **Adapts intelligently** using multiple testing personas (Security, Validation, Chaos, etc.)
- **Reports findings** with detailed markdown reports and severity classification

## Setup Instructions

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- OpenAI API key (or Gemini/Anthropic)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Create environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your API key and target URL

### How to Run the Agent

Start exploration with default settings:
```bash
npm run explore
```

#### Command-Line Parameters

You can override environment variables using command-line parameters:

```bash
# Explore a specific URL
npm run explore -- --url https://example.com

# Explore with a custom objective
npm run explore -- --objective "Test the checkout flow thoroughly"

# Combine multiple parameters
npm run explore -- --url https://example.com --objective "Focus on payment processing"

# Resume a specific session
npm run resume -- --session <session-id>
```

**Available Parameters:**
- `--url <URL>` - Target URL to explore (overrides `TARGET_URL` from `.env`)
- `--objective <OBJECTIVE>` - Exploration objective (overrides `EXPLORATION_OBJECTIVE` from `.env`)

#### Other Development Commands

- `npm run dev` - Development mode with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm test` - Run all tests
- `npm run test:integration` - Run integration tests only

## Features

### Intelligent Bug Detection

The agent actively looks for:

| Category | Examples |
|----------|----------|
| **Text Issues** | Typos, misspellings, grammatical errors |
| **Data Issues** | "undefined", "null", "NaN", "[object Object]" |
| **Functional Bugs** | Broken buttons, failed form submissions |
| **Console Errors** | JavaScript exceptions, API failures |
| **Network Issues** | 404 errors, timeout failures |
| **UI Problems** | Broken images, layout issues |

### Testing Personas

The agent uses specialized personas for comprehensive coverage:

- **Security Agent** - Tests for XSS, injection, authentication issues
- **Monitor Agent** - Tracks console errors and performance
- **Validation Agent** - Verifies form validation and error handling
- **Chaos Agent** - Tests edge cases with unusual inputs
- **Edge Case Agent** - Explores boundary conditions

### Smart Deduplication

Findings are automatically deduplicated to avoid reporting the same bug multiple times (e.g., a typo in a header that appears on every page).

### Severity Classification

Issues are automatically classified by severity:

| Severity | Criteria |
|----------|----------|
| **Critical** | Security issues, data loss, crashes |
| **High** | Functional failures, undefined values |
| **Medium** | Typos, usability issues |
| **Low** | Minor improvements |

## Project Structure

```
ai-exploratory-agent/
├── src/
│   ├── domain/                 # Core business logic
│   │   ├── exploration/        # Session, Step, Finding entities
│   │   ├── config/             # AppConfig interfaces
│   │   ├── errors/             # Domain errors
│   │   ├── browser/            # PageState, InteractiveElement
│   │   ├── tools/              # Tool interface, ToolRegistry
│   │   ├── personas/           # Testing personas
│   │   └── events/             # Domain events
│   ├── application/            # Use cases & orchestration
│   │   ├── services/           # ExplorationService, ReportGenerator
│   │   └── ports/              # Interface definitions
│   ├── infrastructure/         # External integrations
│   │   ├── config/             # ConfigFactory, Zod Schemas
│   │   ├── di/                 # CompositionRoot (Dependency Injection)
│   │   ├── browser/            # Playwright adapter
│   │   ├── llm/                # OpenAI/Gemini/Anthropic adapters
│   │   │   ├── prompts/        # Modular prompt architecture
│   │   │   │   ├── sections/   # Individual prompt sections
│   │   │   │   └── builders/   # SystemPromptBuilder
│   │   │   ├── config/         # Prompt configuration
│   │   │   └── observability/  # PromptLogger
│   │   ├── tools/              # BrokenImageDetector, etc.
│   │   ├── persistence/        # File-based storage
│   │   ├── cli/                # Terminal interactions
│   │   └── events/             # Event bus implementation
│   └── main.ts                 # Entry point
├── tests/                      # Test suites
├── reports/                    # Generated reports
├── findings/                   # Persisted findings
├── screenshots/                # Evidence screenshots
└── logs/                       # Prompt logs (for debugging)
    └── prompts/                # Logged LLM prompts

## Architecture Overview

The project follows **Clean Architecture** principles with **Domain-Driven Design** and **Dependency Injection**:

```
┌─────────────────────────────────────────────────┐
│                 CLI / Main                      │
│        (CompositionRoot & ConfigFactory)        │
├─────────────────────────────────────────────────┤
│             Application Layer                   │
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ ExplorationSvc  │  │   ReportGenerator    │  │
│  └────────┬────────┘  └──────────────────────┘  │
├───────────┼─────────────────────────────────────┤
│           │        Domain Layer                 │
│  ┌────────▼────────┐  ┌──────────────────────┐  │
│  │    Session      │  │       Finding        │  │
│  │     Step        │  │       AppConfig      │  │
│  │    Persona      │  │       Tool           │  │
│  └─────────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────┤
│            Infrastructure Layer                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Playwright│ │  OpenAI   │ │ FileStorage   │  │
│  │  Adapter  │ │  Adapter  │ │   Adapter     │  │
│  └───────────┘ └───────────┘ └───────────────┘  │
└─────────────────────────────────────────────────┘
```


## Design Decisions and Trade-offs

[docs/TRADE-OFFS.md](docs/TRADE-OFFS.md)

## Future Roadmap

The project roadmap tracks planned improvements in deployment, observability, code quality and AI capabilities:
[docs/ROADMAP.md](docs/ROADMAP.md)

### 1. Port/Adapter Pattern
All external dependencies (browser, LLM, storage) are abstracted behind interfaces, enabling easy testing and swapping implementations. This allows the agent to work with different LLM providers and browser automation tools without changing core logic.

### 2. Testing Personas
Instead of a single testing approach, multiple specialized personas provide diverse perspectives on potential issues. Each persona has specific expertise (security, validation, chaos testing) and contributes suggestions based on their focus area.

### 3. Finding Deduplication
Normalized text comparison prevents duplicate bug reports for issues that appear on multiple pages. This reduces noise in the final report and focuses on unique issues.

### 4. Retry Logic with Backoff
LLM API calls use exponential backoff to handle rate limits and transient failures. This improves reliability when dealing with external API services.

### 5. Token Tracking
Full visibility into LLM token consumption for cost management and optimization.

### 6. LLM Provider Choice
The implementation supports multiple LLM providers (OpenAI, Anthropic, Gemini) with OpenAI as the default. OpenAI was chosen for its reliable API, good instruction following, and cost-effectiveness with the GPT-4o-mini model for exploratory testing tasks.

### 7. LLM Resilience & Fallback
The system implements a **circuit breaker pattern** for LLM provider failures. If the primary LLM provider is unavailable or rate-limited, the agent automatically falls back to secondary providers without interrupting exploration. The circuit breaker tracks provider health and routes requests to healthy instances.

Key design rationale:
- **Automatic Failover**: Seamlessly switches to backup providers without manual intervention.
- **Health Tracking**: Per-provider state machine (closed/open/half-open) ensures failed providers are temporarily bypassed.
- **Configurable Thresholds**: Failure tolerance and recovery timeouts can be tuned per deployment environment.
- **Optional Feature**: Circuit breaker is disabled for single-provider setups to minimize overhead.

### 8. Modular Prompt Architecture
The LLM prompts use a **modular, composable architecture** instead of monolithic prompt strings. This enables:

- **Maintainability**: Prompts are split into focused sections (role, bug priorities, decision guidelines, etc.) that can be modified independently
- **Versioning**: Easy to track changes and A/B test different prompt variants
- **Observability**: All prompts sent to LLMs are logged to `./logs/prompts/` for debugging and analysis
- **Configuration**: Token limits, context window sizes, and temperatures are centralized in a config file
- **Flexibility**: Build different prompts for different exploration phases (discovery, bug hunting, verification)

**SystemPromptBuilder** provides a fluent API:
```typescript
// Default complete prompt
const prompt = SystemPromptBuilder.buildDefault();

// Custom composition
const customPrompt = new SystemPromptBuilder()
  .addRole()
  .addResponsibilities()
  .addBugPriorities()
  .addCustomSection("## Special Instructions\n...")
  .build();

// Phase-specific prompts
const discoveryPrompt = SystemPromptBuilder.buildForDiscovery();
const bugHuntingPrompt = SystemPromptBuilder.buildForBugHunting();
```

All magic numbers (max elements, history steps, text chars) are configurable via environment variables, and all prompts are automatically logged with metadata for analysis.

### 9. Test Generation with Soft Assertions
The test generator creates Playwright specs that prioritize **false-negative avoidance** over strict correctness. Soft assertions (warnings instead of failures) for accessibility and console errors reduce flakiness without losing visibility into potential issues. Console errors from expected sources (404s, 401s, favicon) are automatically whitelisted.

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_URL` | practice site | URL to explore |
| `LLM_PROVIDER` | `openai` | LLM provider (openai, gemini, anthropic) |
| `LLM_FALLBACK_PROVIDERS` | - | Comma-separated fallback providers (e.g., `gemini,anthropic`). Tries primary first, then fallbacks in order. |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `LLM_MODEL` | `gpt-4o-mini` | Model to use |
| `ENABLE_LLM_CIRCUIT_BREAKER` | `true` | Enable circuit breaker for LLM provider failures (set to `false` to disable) |
| `LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | Consecutive failures before circuit opens (triggers fallback) |
| `LLM_CIRCUIT_BREAKER_RESET_MS` | `60000` | Milliseconds to wait before attempting provider recovery (1 minute) |
| `LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `2` | Consecutive successes needed to close circuit and confirm recovery |
| `MAX_STEPS` | `50` | Maximum exploration steps |
| `CHECKPOINT_INTERVAL` | `10` | Steps between human checkpoints |
| `ACTION_LOOP_MAX_REPETITIONS` | `2` | Max times same action can repeat before forcing alternative |
| `HEADLESS` | `true` | Run browser in headless mode |
| `SCREENSHOT_DIR` | `./screenshots` | Directory to save screenshots |
| `VERBOSE` | `false` | Enable verbose logging |

See `.env.example` for the complete list of configuration options including prompt configuration, persona settings, page exploration limits, and more.

## Generated Reports

Reports are generated in Markdown format at `reports/YYYY-MM-DD-{session-id}-report.md` with:

- Executive summary (actions taken, pages visited, findings count, duration)
- Findings by severity (Critical, High, Medium, Low)
- Detailed findings with descriptions and evidence
- Coverage summary

### Example Report

An example generated report from a recent run is available in the repository:

- [reports/2025-12-18-acc2e5a1-report.md](reports/2025-12-18-acc2e5a1-report.md)

## Testing

Run the test suite:
```bash
npm test
```

Additional test commands:
- `npm run test:coverage` - Run with coverage
- `npm run type-check` - TypeScript type checking
- `npm run lint` - ESLint code quality check

### Test Generation & Assertion Policy

The system automatically generates Playwright test specs from exploration findings. Tests now use **strict assertions** for console errors and accessibility issues so failing specs indicate reproducible bugs that should be fixed or explicitly acknowledged.

- **Console Errors**: Expected errors (401, 404, favicon, rate limits) are still whitelisted via configuration, but any unexpected console error will cause the generated test to fail. Configure ignored patterns via the `ignoreConsoleErrors` setting in the test generation config.
- **Accessibility Issues**: Missing alt text or unlabeled buttons are treated as test failures so they can serve as regression checks.
- **Text Issues**: Occurrences of literal `undefined`, critical error indicators, and detected typos will now cause the test to fail rather than only logging a warning.

This approach:
- **Ensures Reproducibility**: Failing tests are reliable indicators of bugs and suitable as TDD 'red' tests.
- **Enables CI Enforcement**: Hard failures can block merges until bugs are addressed.
- **Requires Triage**: Expect more failing specs initially; use severity filters or config to tune which findings generate hard assertions.

### Using Failing Tests as TDD 'Red' Checks

- Generated Playwright tests that fail should be treated as a confirmation of a real issue discovered by the exploration run. A failing spec is a valid "red" signal in a TDD workflow: it documents the bug, reproduces the failure in CI, and can be used as the starting point for a fix.
- Recommended workflow:
   1. Run the generated test and confirm it fails (red).
   2. Implement a fix in the codebase or test expectations (green).
   3. Keep the test as a regression check (refactor) and include it in CI.

Note: Because assertions are stricter, you can selectively tune behavior by severity (e.g., only fail on `Critical`/`High`) or by toggling generation flags when running the test generator.

Example generated test (current behavior):
```typescript
// From finding: "Console error detected: Uncaught TypeError"
// Hard assertion: unexpected console errors fail the test
const consoleErrors: string[] = [];
page.on('console', msg => {
   if (msg.type() === 'error') consoleErrors.push(msg.text());
});
await page.reload();
await page.waitForLoadState('networkidle');
expect(consoleErrors).toHaveLength(0);

// From finding: "Image missing alt text"
// Hard assertion: images must have alt text
const imagesWithoutAlt = await page.locator('img:not([alt])').count();
expect(imagesWithoutAlt, 'Images should have alt text').toBe(0);
```
