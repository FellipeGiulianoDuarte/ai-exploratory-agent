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
│   │   ├── browser/            # PageState, InteractiveElement
│   │   ├── tools/              # Tool interface, ToolRegistry
│   │   ├── personas/           # Testing personas
│   │   └── events/             # Domain events
│   ├── application/            # Use cases & orchestration
│   │   ├── services/           # ExplorationService, ReportGenerator
│   │   └── ports/              # Interface definitions
│   ├── infrastructure/         # External integrations
│   │   ├── browser/            # Playwright adapter
│   │   ├── llm/                # OpenAI/Gemini adapters
│   │   ├── tools/              # BrokenImageDetector
│   │   ├── persistence/        # File-based storage
│   │   ├── cli/                # Terminal interactions
│   │   └── events/             # Event bus implementation
│   └── main.ts                 # Entry point
├── tests/                      # Test suites
├── reports/                    # Generated reports
├── findings/                   # Persisted findings
└── screenshots/                # Evidence screenshots
```

## Architecture Overview

The project follows **Clean Architecture** principles with **Domain-Driven Design**:

```
┌─────────────────────────────────────────────────┐
│                 CLI / Main                      │
├─────────────────────────────────────────────────┤
│             Application Layer                   │
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ ExplorationSvc  │  │   ReportGenerator    │  │
│  └────────┬────────┘  └──────────────────────┘  │
├───────────┼─────────────────────────────────────┤
│           │        Domain Layer                 │
│  ┌────────▼────────┐  ┌──────────────────────┐  │
│  │    Session      │  │       Finding        │  │
│  │     Step        │  │       PageState      │  │
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

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_URL` | practice site | URL to explore |
| `LLM_PROVIDER` | `openai` | LLM provider (openai, gemini, anthropic) |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `LLM_MODEL` | `gpt-4o-mini` | Model to use |
| `MAX_STEPS` | `50` | Maximum exploration steps |
| `CHECKPOINT_INTERVAL` | `10` | Steps between human checkpoints |
| `HEADLESS` | `true` | Run browser in headless mode |
| `VERBOSE` | `false` | Enable verbose logging |

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
