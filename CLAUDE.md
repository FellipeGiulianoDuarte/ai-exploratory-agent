# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## HARD RULES - MANDATORY

### Test After Coding (Non-Negotiable)

**YOU MUST ALWAYS TEST YOUR IMPLEMENTATION BEFORE CONSIDERING IT COMPLETE.**

For every code implementation, you MUST:

1. **Plan Testing Strategy First**
   - Before writing implementation code, outline how it will be tested
   - Identify testable units and integration points

2. **Write Unit Tests**
   - Cover all important business logic
   - Test edge cases and error conditions
   - Focus on domain layer and application layer logic
   - Aim for high coverage of critical paths

3. **Write Integration Tests**
   - Use dependency injection to test component interactions
   - Test use cases with real domain objects and mocked infrastructure
   - Verify proper communication between layers

4. **Mock External Dependencies**
   - All tests depending on external providers MUST be mocked
   - Mock: LLM API calls, Playwright browser operations, File system operations
   - Use test doubles (mocks, stubs, fakes) for infrastructure adapters

5. **Run All Tests**
   - Execute: `npm test` (or appropriate test command)
   - Verify all tests pass locally
   - Check test output for failures or warnings

6. **Iterate Until Tests Pass**
   - If tests fail, fix the implementation or tests
   - Continue working until ALL tests are green
   - Do NOT proceed to next task while tests are failing
   - Do NOT mark work as complete with failing tests

**Workflow:**
```
Code Implementation → Write Tests → Run Tests → Tests Fail? → Fix & Retry
                                        ↓ Tests Pass
                                    Mark Complete & Proceed
```

**This rule applies to ALL code changes: new features, bug fixes, refactoring.**

## Project Overview

This is an AI-powered exploratory testing agent built in TypeScript that autonomously explores web applications, discovers issues, and generates structured reports. The agent uses LLMs (Anthropic Claude or OpenAI) for intelligent decision-making and Playwright for browser automation.

**Target Application:** https://with-bugs.practicesoftwaretesting.com (e-commerce site with intentional bugs)

## Architecture

The project follows a **Modular Monolith** architecture based on **Domain-Driven Design (DDD)** principles with **Clean Architecture** layering. This design enables future extraction into microservices while keeping initial implementation simple.

### Layer Structure

```
PRESENTATION LAYER (CLI Interface)
    ↓
APPLICATION LAYER (Use Cases, Orchestration)
    ↓
DOMAIN LAYER (Business Logic, Entities, Value Objects)
    ↓
INFRASTRUCTURE LAYER (Playwright, LLM Clients, File System)
```

**Dependency Rule:** All dependencies point inward. The domain layer has zero external dependencies.

### Bounded Contexts

The system is organized into six bounded contexts:

1. **Exploration Core** - Orchestrates the autonomous exploration loop and state machine
2. **Browser Automation** - Handles all Playwright interactions
3. **Intelligence** - LLM integration for decision-making and analysis
4. **Tools** - Custom inspection tools (like `find_broken_images`)
5. **Findings** - Tracks discovered issues and maintains evidence
6. **Reporting** - Generates structured reports from exploration sessions
7. **Human Interaction** - CLI-based human-in-the-loop mechanism

### Key Design Patterns

- **Adapter Pattern**: Abstract LLM providers (Anthropic, OpenAI) behind common interface
- **Strategy Pattern**: Interchangeable exploration strategies
- **Repository Pattern**: Abstract persistence mechanism
- **Domain Events**: Decouple contexts via event bus (in-memory for now)
- **Template Method**: Base tool class with common validation/error handling

### Folder Structure

```
src/
  domain/           # Entities, Value Objects, Domain Services
    exploration/    # ExplorationSession, ExplorationStep
    findings/       # Finding entity, Severity, Evidence
    tools/          # Tool interface, ToolRegistry
    shared/         # Entity, ValueObject, DomainEvent base classes
  application/      # Use Cases, DTOs, Ports (interfaces)
    ports/          # BrowserPort, LLMPort, HumanInteractionPort
    use-cases/      # StartExplorationUseCase, ExecuteStepUseCase
    services/       # ExplorationService, ReportGeneratorService
  infrastructure/   # Concrete implementations
    browser/        # PlaywrightBrowserAdapter
    llm/            # AnthropicAdapter, OpenAIAdapter
    tools/          # BrokenImageDetectorTool (required custom tool)
    persistence/    # FileSystemSessionRepository
    events/         # InMemoryEventBus
    cli/            # InquirerInteractionAdapter
  presentation/     # CLI entry point
    cli/
reports/            # Generated exploration reports
screenshots/        # Evidence screenshots
```

## Core Components

### Required Custom Tool: `find_broken_images`

This tool must be implemented from scratch to demonstrate tool creation patterns. It should:
- Detect images with HTTP errors (404s)
- Detect images with invalid/empty src attributes
- Detect images with zero dimensions (naturalWidth/naturalHeight = 0)
- Return structured report: image src, alt text, location, failure reason

Located at: `src/infrastructure/tools/BrokenImageDetectorTool.ts`

### Exploration Loop

The main agent loop follows this pattern:

```typescript
while (session.isRunning) {
  pageState = browser.extractPageState()
  decision = intelligence.decideNextAction(pageState, session.history)
  result = browser.executeAction(decision.action)
  session.recordStep(decision, result)

  if (shouldCheckpoint(session)) {
    guidance = humanInteraction.checkpoint(session.summary)
    session.applyGuidance(guidance)
  }
}
```

### Human-in-the-Loop Checkpoints

The agent pauses for human input at:
- Every 5 successful actions
- After tool invocation with findings
- When LLM confidence < 0.6
- At natural breakpoints (e.g., after completing a flow)

## Development Commands

### Setup
```bash
npm install
cp .env.example .env
# Edit .env with your API keys
```

### Running the Agent
```bash
npm start                                    # Start exploration of default target
npm start -- --target <url>                  # Explore specific URL
npm run resume -- --session <id>             # Resume previous session
```

### Development
```bash
npm run dev                                  # Development mode with watch
npm run validate:browser                     # Test browser automation setup
npm run validate:llm                         # Test LLM connection
```

### Testing
```bash
npm test                                     # Run all tests
npm run test:unit                           # Unit tests only
npm run test:integration                    # Integration tests
npm run test:e2e                            # End-to-end tests
npm run test:tools                          # Test custom tools
```

### Code Quality
```bash
npm run lint                                # ESLint
npm run format                              # Prettier
npm run type-check                          # TypeScript compiler check
```

## Technical Decisions

### LLM Provider
**Primary:** Anthropic Claude (claude-sonnet-4-20250514)
- Excellent instruction following for complex system prompts
- Strong reasoning capabilities for hypothesis generation
- Good structured output with tool-use patterns

**Fallback:** OpenAI GPT-4
- Available if Anthropic API fails
- Configured via LLM_PROVIDER environment variable

### Persistence Strategy
**File-based JSON** for MVP (abstracts behind Repository interface for future database migration)
- Simple, no external dependencies
- Easy debugging and state inspection
- Repository pattern allows seamless migration to SQLite/PostgreSQL

### Browser Automation
**Playwright** (required by specification)
- Configured for headless mode by default
- 30-second timeout for actions
- Retry logic with exponential backoff

## Environment Configuration

Required variables in `.env`:

```env
# LLM Configuration
LLM_PROVIDER=anthropic           # anthropic | openai
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Browser Configuration
HEADLESS=true
BROWSER_TIMEOUT=30000
SCREENSHOT_DIR=./screenshots

# Exploration Configuration
TARGET_URL=https://with-bugs.practicesoftwaretesting.com
MAX_STEPS=50
CHECKPOINT_INTERVAL=5
MIN_CONFIDENCE_THRESHOLD=0.6

# Report Configuration
REPORT_DIR=./reports
```

## Key Abstractions

### Ports (Interfaces)
All cross-context communication goes through defined ports, never concrete implementations:
- `BrowserPort` - Browser automation operations
- `LLMPort` - LLM completion requests
- `ToolRegistryPort` - Tool registration and invocation
- `SessionRepository` - Session persistence
- `FindingsRepository` - Findings persistence

### Domain Events
Used for decoupled communication between contexts:
- `StepCompleted` - After each exploration step
- `BrokenImagesDetected` - When image tool finds issues
- `FindingDiscovered` - When new issue identified
- `SessionCompleted` - When exploration finishes

### Value Objects
Immutable domain primitives:
- `Action` - NavigateAction | ClickAction | FillAction | SelectAction
- `PageState` - URL, title, contentHash, interactive elements
- `Confidence` - 0-1 value with justification factors
- `Severity` - Level (CRITICAL | HIGH | MEDIUM | LOW) with justification

## Report Structure

Generated reports are Markdown files with:
- Executive Summary (actions, pages, issues by severity)
- Findings (Bugs, Broken Images, UX Issues)
- Coverage Summary (pages visited, areas not covered)
- Methodology (exploration strategy, tool invocations)
- Screenshot evidence embedded/referenced

## Code Style Guidelines

### TypeScript
- Strict mode enabled (`tsconfig.json`)
- No implicit any
- Strict null checks
- No unused locals or parameters
- All domain objects properly typed

### Naming Conventions
- Entities: PascalCase (e.g., `ExplorationSession`)
- Value Objects: PascalCase (e.g., `PageState`)
- Services: PascalCase + "Service" suffix (e.g., `ExplorationService`)
- Ports: PascalCase + "Port" suffix (e.g., `BrowserPort`)
- Adapters: PascalCase + "Adapter" suffix (e.g., `AnthropicAdapter`)
- Use Cases: PascalCase + "UseCase" suffix (e.g., `StartExplorationUseCase`)

### Domain Model
- Entities have identity and mutable state
- Value Objects are immutable
- Aggregates enforce invariants
- No domain logic in infrastructure layer
- Domain events for side effects
