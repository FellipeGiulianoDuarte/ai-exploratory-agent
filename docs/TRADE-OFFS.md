Technical Trade-offs: Current State vs. Evolution

This document summarizes the system architecture, contrasting what is implemented today with proposed improvements and their likely impacts.

---

## Design Philosophy

The system prioritizes **maintainability** and **observability** over premature optimization. Each architectural decision aims to:
1. Make the codebase easy to understand and modify
2. Provide visibility into system behavior for debugging
3. Keep the initial implementation simple while enabling future evolution
4. Avoid lock-in to specific technologies or patterns

---

1) Adapters (LLM)
- What we have: `LLMPort` interface and working adapters (OpenAI, Anthropic, Gemini).
- What we can do: Add new providers or standardize via a dependency injection (DI) container; expose advanced capabilities such as streaming and function-calling.
- Trade-offs:
  - Pros: Easy to swap providers by configuration.
  - Cons: Potential loss of provider-specific features; streaming and advanced features increase testing complexity.

2) Factory (Object Creation)
- What we have: `LLMAdapterFactory` that constructs adapters and handles fallback and circuit-breaker behavior.
- What we can do: Replace the factory with a DI container to enable runtime swapping and cleaner tests.
- Trade-offs:
  - Factory: Simple and localized responsibility.
  - DI: More flexible but adds complexity and extra dependencies.

3) Repository (Persistence)
- What we have: `FileBasedFindingsRepository` and `FileBasedSessionRepository` (file-based repository pattern).
- What we can do: Implement `MongoFindingsRepository` with a `DatabaseConnector` and use `mongodb-memory-server` for tests.
- Trade-offs:
  - Files: Maximum simplicity and zero external infra.
  - MongoDB: Enables complex queries, indexes and scale; requires infra, backups, and different test mocks.

4) Application Layer (Services)
- What we have: `ExplorationService` and `TestGeneratorService` orchestrating application logic.
- What we can do: Decompose into microservices, apply CQRS (separate read/write) and add middleware for logging and retries.
- Trade-offs: A simple monolith today vs. modularity that helps scaling but increases code and operational overhead.

5) Tools Registry
- What we have: `Tool` interface and `ToolRegistry` for basic registration and invocation.
- What we can do: Implement dynamic capability discovery, tool versioning and sandboxed isolation.
- Trade-offs: A simple registry is easy to reason about; dynamic behavior requires strict validation and security infrastructure.

6) Observability & Events
- What we have: Basic events (checkpoints/steps) and plaintext logs.
- What we can do: Implement an event bus (pub/sub) and tracing with Prometheus/Jaeger.
- Trade-offs: Greatly improves operations and diagnostics but introduces implementation cost and initial data noise.

7) Resilience (Circuit Breaker & Fallback)
- What we have: Configurable fallback between LLM providers.
- What we can do: Add real-time alerts, adaptive throttling per provider, and cost-based policies.
- Trade-offs: Increases resilience; however, different providers may produce slightly different results in tests.

8) Test Generation (Playwright)
- What we have: `TestGeneratorService` that produces Playwright specs using templates and heuristics.
- What we can do: Add an LLM-assisted refinement loop, human review workflow, and versioning for trusted specs.
- Trade-offs: Automatic generation accelerates coverage but may introduce false positives that require human maintenance.

9) Prompt Architecture (LLM Prompts)
- What we have: **Modular, composable prompt system** with:
  - Decomposed prompt sections (role, bug priorities, decision guidelines, etc.) in separate files
  - `SystemPromptBuilder` for flexible prompt composition with fluent API
  - Centralized configuration for all magic numbers (max elements, history steps, text chars)
  - `PromptLogger` that logs all prompts to `./logs/prompts/` with metadata
  - Phase-specific prompt variants (discovery, bug hunting, verification)
- What we can do:
  - Add prompt versioning system with semantic versioning
  - Implement A/B testing framework for comparing prompt effectiveness
  - Add dynamic few-shot example selection based on current context
  - Create context-aware prompt assembly (different prompts for different scenarios)
  - Add prompt performance metrics and analytics
  - Implement template engine (Handlebars) for type-safe variable substitution
  - Build prompt learning system that generates new examples from successful runs
- Trade-offs:
  - Current: Simple, maintainable, observable, testable. Easy to modify individual sections without affecting others. All prompts logged for debugging. Configuration is centralized and environment-variable driven.
  - Advanced: Better performance through optimization, data-driven improvements via A/B testing. However, adds complexity (versioning, metrics collection, template engine dependencies), increases maintenance burden, and requires careful testing to ensure prompt changes don't degrade quality.

10) Configuration & Security
- What we have: Local `.env` and simple feature flags (ENABLE_PERSONAS).
- What we can do: Migrate secrets to a secret manager, adopt typed validation (Zod) and remote feature flags.
- Trade-offs: Improved security and dynamic control vs. higher operational cost and changes to developer workflow.

11) Multi-Agent Architecture (State Machine + Supervisor Pattern)
- What we have: **State Machine per Agent** with 11 states for predictable exploration flow, plus **Supervisor Pattern** for coordinating multiple agents.
- Key components:
  - `ExplorationState` - Enum with valid state transitions
  - `ExplorationStateMachine` - Orchestrates state transitions via handlers
  - `AgentContext` - Encapsulates all per-agent state
  - `AgentSupervisor` - Coordinates multiple agents with `WorkQueue` and `SharedExplorationState`
- What we can do:
  - Add dynamic agent scaling based on discovered URL count
  - Implement priority-based agent allocation
  - Add agent specialization (e.g., security agent, performance agent)
  - Implement agent communication for sharing insights
- Trade-offs:
  - Advanced: More complex orchestration but better performance on large sites. Multi-agent adds coordination overhead and potential for race conditions.

12) Session Resumption Strategy
- What we have: **Logical State Resumption**. The `resume` feature restores the agent's memory (history, findings, LLM context) and navigates to the last URL, but **resets the browser process**.
- What we can do: Implement full **Browser State Serialization** (saving cookies, local storage, session storage, and exact DOM state via CDP snapshots).
- Trade-offs:
  - Current (Logical): robust and simple. Avoids "stale element" errors because pages are re-parsed fresh. If the session crashed due to browser instability, a fresh browser is exactly what we want.
  - Full Serialization: allows resuming mid-interaction (e.g., half-filled form), but is technically brittle and huge in data size. Restoring exact DOM state is often unreliable on dynamic sites.