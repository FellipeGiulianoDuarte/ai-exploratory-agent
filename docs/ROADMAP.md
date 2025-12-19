# Product Roadmap

This document outlines planned improvements and future work areas for the AI Exploratory Agent. Items are listed for tracking purposes and do not imply a specific prioritization order.

## Infrastructure & Operations
- **Deployment**: Establish a formal deployment strategy (e.g., Docker containers, CI/CD pipelines) for running the agent in production environments.
- **Observability Integration**: Connect the current token tracking and logging to industry-standard observability tools like **Prometheus** and **OpenTelemetry**.
- **Real-time Metrics**: Implement comprehensive observability to track system health, latency, and success rates beyond static reports.

## Architecture & Code Quality
- **Type Safety (Remove `any`)**: Eliminate technical debt types accumulated during the rapid MVP phase. Replace all `any` usages with strict TypeScript types/interfaces.
- **Agent Supervisor Maturity**: Evolve the `AgentSupervisor` from its current Proof-Of-Concept (POC)/experimental state into a robust, production-ready orchestration layer.
- **Guardrails**: Implement architectural guardrails to strictly bound agent behavior and prevent unintended actions or scope creep.

## AI & Logic Refinement
- **Prompt Improvements**: Continuously iterate on LLM prompts to improve reasoning, context retention, and bug detection accuracy.
- **Token Budgeting**: Implement a strict token budget system to manage limits and costs effectively during long exploration runs.
- **Heuristic Refinement**: Iterate on and refine the "magic numbers" (constants used for thresholds, limits, timeouts) based on real-world usage data.

## Capabilities
- **New Tools**: Expand the tool registry with additional capabilities (e.g., dedicated accessibility scanners, API interaction tools, deeper state analysis).
