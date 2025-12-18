/**
 * Testing Personas Module
 *
 * Each persona represents a specialized testing approach:
 * - ChaosPersona: "How can I break this?" - destructive testing
 * - SecurityPersona: "Is this secure?" - vulnerability scanning
 * - ValidationPersona: "Is this correct?" - error detection
 * - MonitorPersona: Watches logs, network, and console
 * - EdgeCasePersona: Boundary and edge case testing
 */

export * from './TestingPersona';
export * from './ChaosPersona';
export * from './SecurityPersona';
export * from './ValidationPersona';
export * from './MonitorPersona';
export * from './EdgeCasePersona';

import { PersonaManager, getDefaultPersonaManager } from './TestingPersona';
import { ChaosPersona } from './ChaosPersona';
import { SecurityPersona } from './SecurityPersona';
import { ValidationPersona } from './ValidationPersona';
import { MonitorPersona } from './MonitorPersona';
import { EdgeCasePersona } from './EdgeCasePersona';

/**
 * Configuration for which personas to enable.
 */
export interface PersonaConfig {
  enableSecurity?: boolean;
  enableMonitor?: boolean;
  enableValidation?: boolean;
  enableChaos?: boolean;
  enableEdgeCase?: boolean;
}

/**
 * Register default personas with the manager based on configuration.
 */
export function registerDefaultPersonas(
  manager?: PersonaManager,
  config?: PersonaConfig
): PersonaManager {
  const pm = manager || getDefaultPersonaManager();

  // Default to enabling all personas if no config provided
  const cfg: Required<PersonaConfig> = {
    enableSecurity: config?.enableSecurity ?? true,
    enableMonitor: config?.enableMonitor ?? true,
    enableValidation: config?.enableValidation ?? true,
    enableChaos: config?.enableChaos ?? true,
    enableEdgeCase: config?.enableEdgeCase ?? true,
  };

  if (cfg.enableSecurity) {
    pm.register(new SecurityPersona()); // Priority 10 - Security is most important
  }
  if (cfg.enableMonitor) {
    pm.register(new MonitorPersona()); // Priority 9 - Catches runtime issues
  }
  if (cfg.enableValidation) {
    pm.register(new ValidationPersona()); // Priority 8 - Verifies correctness
  }
  if (cfg.enableChaos) {
    pm.register(new ChaosPersona()); // Priority 7 - Tries to break things
  }
  if (cfg.enableEdgeCase) {
    pm.register(new EdgeCasePersona()); // Priority 6 - Tests boundaries
  }

  return pm;
}

/**
 * Get a brief description of all available personas.
 */
export function describePersonas(): string {
  return `
## Testing Personas

1. **Security Agent** (Priority: 10)
   Focuses on finding security vulnerabilities including XSS, SQL injection,
   IDOR, and other security issues.

2. **Monitor Agent** (Priority: 9)
   Watches console logs, network requests, and runtime errors to catch
   issues that aren't visible on the page.

3. **Validation Agent** (Priority: 8)
   Verifies that the page displays correctly, looking for visible errors,
   broken UI, and unexpected states.

4. **Chaos Agent** (Priority: 7)
   Tries to break things through unexpected inputs, rapid actions,
   and unusual usage patterns.

5. **Edge Case Agent** (Priority: 6)
   Tests boundary conditions, limits, and edge cases like zero values,
   maximum integers, and invalid dates.
`.trim();
}
