import { PageContext } from '../exploration/PageContext';
import { ActionDecision } from '../exploration/ActionTypes';

// Re-export for backward compatibility
export type { PageContext as LLMPageContext } from '../exploration/PageContext';

// Internal alias to use PageContext as LLMPageContext
type LLMPageContext = PageContext;

/**
 * Base interface for testing personas.
 * Each persona focuses on a specific type of testing approach.
 */
export interface TestingPersona {
  /** Unique identifier for the persona */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this persona focuses on */
  readonly description: string;

  /** Priority level (higher = more important findings) */
  readonly priority: number;

  /**
   * Analyze the current page and suggest actions based on this persona's focus.
   * @param context Current page context
   * @param history Recent action history
   * @returns Suggested actions with reasoning
   */
  analyzeAndSuggest(
    context: PageContext,
    history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[];

  /**
   * Get the system prompt addition for this persona.
   * This is appended to the base system prompt when this persona is active.
   */
  getSystemPromptAddition(): string;

  /**
   * Check if this persona is relevant for the current page.
   * @param context Current page context
   * @returns true if this persona should be active
   */
  isRelevant(context: PageContext): boolean;
}

/**
 * A suggestion from a testing persona.
 */
export interface PersonaSuggestion {
  /** The suggested action */
  action: Partial<ActionDecision>;

  /** Why this persona suggests this action */
  reasoning: string;

  /** Risk level of this test */
  riskLevel: 'safe' | 'moderate' | 'destructive';

  /** Expected finding type if test reveals an issue */
  expectedFindingType?: string;

  /** Confidence that this is a good test */
  confidence: number;
}

/**
 * Result of persona analysis.
 */
export interface PersonaAnalysis {
  personaId: string;
  personaName: string;
  isRelevant: boolean;
  suggestions: PersonaSuggestion[];
  observations: string[];
}

/**
 * Manages multiple testing personas and coordinates their suggestions.
 */
export class PersonaManager {
  private personas: Map<string, TestingPersona> = new Map();

  /**
   * Register a testing persona.
   */
  register(persona: TestingPersona): void {
    this.personas.set(persona.id, persona);
  }

  /**
   * Get all registered personas.
   */
  getAll(): TestingPersona[] {
    return Array.from(this.personas.values());
  }

  /**
   * Get a persona by ID.
   */
  get(id: string): TestingPersona | undefined {
    return this.personas.get(id);
  }

  /**
   * Get all relevant personas for the current page.
   */
  getRelevantPersonas(context: LLMPageContext): TestingPersona[] {
    return this.getAll().filter(p => p.isRelevant(context));
  }

  /**
   * Collect suggestions from all relevant personas.
   */
  collectSuggestions(
    context: LLMPageContext,
    history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaAnalysis[] {
    const analyses: PersonaAnalysis[] = [];

    for (const persona of this.getAll()) {
      const isRelevant = persona.isRelevant(context);
      const suggestions = isRelevant ? persona.analyzeAndSuggest(context, history) : [];

      analyses.push({
        personaId: persona.id,
        personaName: persona.name,
        isRelevant,
        suggestions,
        observations: [],
      });
    }

    // Sort by priority
    return analyses.sort((a, b) => {
      const personaA = this.personas.get(a.personaId);
      const personaB = this.personas.get(b.personaId);
      return (personaB?.priority || 0) - (personaA?.priority || 0);
    });
  }

  /**
   * Build combined system prompt from all active personas.
   */
  buildCombinedPrompt(context: LLMPageContext): string {
    const relevantPersonas = this.getRelevantPersonas(context);

    if (relevantPersonas.length === 0) {
      return '';
    }

    const additions = relevantPersonas
      .map(p => `### ${p.name}\n${p.getSystemPromptAddition()}`)
      .join('\n\n');

    return `\n## Active Testing Personas\n${additions}`;
  }
}

/**
 * Singleton instance of the persona manager.
 */
let defaultPersonaManager: PersonaManager | null = null;

export function getDefaultPersonaManager(): PersonaManager {
  if (!defaultPersonaManager) {
    defaultPersonaManager = new PersonaManager();
  }
  return defaultPersonaManager;
}

export function resetDefaultPersonaManager(): void {
  defaultPersonaManager = null;
}
