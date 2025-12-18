import { SystemPromptBuilder } from './prompts/builders/SystemPromptBuilder';
import { getPromptConfig } from './config/prompt-config';

// Re-export for convenience
export { SystemPromptBuilder } from './prompts/builders/SystemPromptBuilder';
export { getPromptConfig, setPromptConfig, resetPromptConfig } from './config/prompt-config';
export type { PromptConfig } from './config/prompt-config';

/**
 * System prompt for the exploration agent.
 * Establishes the agent's persona and behavior guidelines.
 *
 * @deprecated Use SystemPromptBuilder.buildDefault() instead for better maintainability.
 * This constant is kept for backward compatibility.
 */
export const SYSTEM_PROMPT = SystemPromptBuilder.buildDefault();

/**
 * Schema for action decision output.
 */
export const ACTION_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'navigate',
        'click',
        'fill',
        'select',
        'hover',
        'scroll',
        'back',
        'refresh',
        'tool',
        'done',
      ],
      description: 'The type of action to perform',
    },
    selector: {
      type: 'string',
      description: 'CSS selector for the target element (required for click, fill, select, hover)',
    },
    value: {
      type: 'string',
      description: 'Value to use (URL for navigate, text for fill, option for select)',
    },
    toolName: {
      type: 'string',
      description: 'Name of the tool to invoke (required when action is "tool")',
    },
    toolParams: {
      type: 'object',
      description: 'Parameters to pass to the tool',
    },
    reasoning: {
      type: 'string',
      description: 'Explanation of why this action was chosen',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score for this decision (0-1)',
    },
    confidenceFactors: {
      type: 'array',
      items: { type: 'string' },
      description: 'Factors that influenced the confidence score',
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          selector: { type: 'string' },
          reasoning: { type: 'string' },
        },
      },
      description: 'Alternative actions that were considered',
    },
    hypothesis: {
      type: 'string',
      description: 'The hypothesis being tested with this action',
    },
    expectedOutcome: {
      type: 'string',
      description: 'What is expected to happen after this action',
    },
    observedIssues: {
      type: 'array',
      items: { type: 'string' },
      description:
        'ONLY confirmed bugs visible right now. Each item should describe ONE specific bug: what is wrong and where. Do NOT include "no issues found", status updates, or speculation.',
    },
  },
  required: ['action', 'reasoning', 'confidence'],
};

/**
 * Format for representing page state to the LLM.
 */
export const PAGE_STATE_FORMAT = `
## Current Page State
URL: {{url}}
Title: {{title}}

### Interactive Elements ({{elementCount}} total)
{{elements}}

### Visible Content (excerpt)
{{visibleText}}

### Page Issues
Console Errors: {{consoleErrors}}
Network Errors: {{networkErrors}}
`;

/**
 * Format for exploration history.
 */
export const HISTORY_FORMAT = `
## Exploration History (last {{count}} steps)
{{steps}}
`;

/**
 * Few-shot examples for quality decisions.
 */
export const FEW_SHOT_EXAMPLES = [
  {
    scenario: 'Login page with empty form',
    pageContext: {
      url: 'https://example.com/login',
      title: 'Login',
      elements: [
        { selector: '#email', type: 'input', text: '', isVisible: true },
        { selector: '#password', type: 'input', text: '', isVisible: true },
        { selector: '#submit', type: 'button', text: 'Sign In', isVisible: true },
      ],
    },
    decision: {
      action: 'click',
      selector: '#submit',
      reasoning:
        'Testing form validation by submitting empty form. This often reveals missing validation or poor error messages.',
      confidence: 0.85,
      confidenceFactors: ['Clear test case', 'Common bug pattern'],
      hypothesis: 'Form may allow submission without validation',
      expectedOutcome: 'Should show validation errors for required fields',
    },
  },
  {
    scenario: 'Product page with images',
    pageContext: {
      url: 'https://example.com/product/123',
      title: 'Product Details',
      elements: [
        { selector: '#main-image', type: 'image', text: '', isVisible: true },
        { selector: '.thumbnail', type: 'image', text: '', isVisible: true },
        { selector: '#add-to-cart', type: 'button', text: 'Add to Cart', isVisible: true },
      ],
    },
    decision: {
      action: 'tool',
      toolName: 'find_broken_images',
      toolParams: {},
      reasoning:
        'Product pages often have broken images due to inventory changes. Running image check to verify all product images load correctly.',
      confidence: 0.9,
      confidenceFactors: ['Images visible on page', 'Common issue area'],
      hypothesis: 'Product images may be broken or missing',
      expectedOutcome: 'Tool will report any broken images found',
    },
  },
  {
    scenario: 'Navigation menu unexplored',
    pageContext: {
      url: 'https://example.com/',
      title: 'Home',
      elements: [
        { selector: 'nav a[href="/products"]', type: 'link', text: 'Products', isVisible: true },
        { selector: 'nav a[href="/about"]', type: 'link', text: 'About', isVisible: true },
        { selector: 'nav a[href="/contact"]', type: 'link', text: 'Contact', isVisible: true },
      ],
    },
    decision: {
      action: 'click',
      selector: 'nav a[href="/products"]',
      reasoning:
        'Starting exploration with Products section as it likely contains the most functionality and potential bugs in an e-commerce site.',
      confidence: 0.8,
      confidenceFactors: ['Unexplored area', 'High-value section'],
      hypothesis: 'Products section will have rich functionality to test',
      expectedOutcome: 'Navigate to products listing page',
    },
  },
];

/**
 * Build user prompt for decision request.
 */
export function buildDecisionPrompt(
  pageContext: {
    url: string;
    title: string;
    visibleText: string;
    elements: Array<{ selector: string; type: string; text: string; isVisible: boolean }>;
    consoleErrors: string[];
    networkErrors: string[];
  },
  history: Array<{
    step: number;
    action: { action: string; selector?: string; value?: string };
    success: boolean;
    resultingUrl: string;
  }>,
  tools: Array<{ name: string; description: string }>,
  objective?: string,
  urlQueueContext?: string,
  reportedBugsSummary?: string
): string {
  const config = getPromptConfig();

  // Format elements
  const elementsText = pageContext.elements
    .slice(0, config.context.maxElements)
    .map(
      (el, i) =>
        `${i + 1}. [${el.type}] ${el.selector} - "${el.text.substring(0, 50)}"${el.isVisible ? '' : ' (hidden)'}`
    )
    .join('\n');

  // Format history with more detail about tool actions
  const historyText = history
    .slice(-config.context.maxHistorySteps)
    .map(h => {
      let actionDesc = h.action.action;
      if (h.action.action === 'tool' && (h.action as any).toolName) {
        actionDesc = `tool:${(h.action as any).toolName}`;
      } else if (h.action.selector) {
        actionDesc += ` on ${h.action.selector}`;
      }
      const status = h.success ? '✓' : '✗';
      return `Step ${h.step}: [${status}] ${actionDesc} → ${h.resultingUrl}`;
    })
    .join('\n');

  // Format tools
  const toolsText = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

  // Format errors
  const consoleErrorsText =
    pageContext.consoleErrors.length > 0
      ? pageContext.consoleErrors.slice(0, config.context.maxConsoleErrors).join('\n')
      : 'None';
  const networkErrorsText =
    pageContext.networkErrors.length > 0
      ? pageContext.networkErrors.slice(0, config.context.maxNetworkErrors).join('\n')
      : 'None';

  return `${objective ? `## Objective\n${objective}\n\n` : ''}## Current Page State
URL: ${pageContext.url}
Title: ${pageContext.title}

### Interactive Elements (${pageContext.elements.length} total, showing first ${config.context.maxElements})
${elementsText}

### Visible Content (IMPORTANT: READ THIS FOR BUGS - look for typos, "undefined", incorrect text)
${pageContext.visibleText.substring(0, config.context.maxVisibleTextChars)}...

### Page Issues
Console Errors: ${consoleErrorsText}
Network Errors: ${networkErrorsText}

## Exploration History (last 10 steps)
${historyText || 'No previous steps'}

## Available Tools
${toolsText}

${
  reportedBugsSummary
    ? `## Already Reported Bugs (DO NOT REPORT AGAIN)
${reportedBugsSummary}

`
    : ''
}## Your Task
Analyze the current page state and decide on the next action to take. 

**IMPORTANT - ACTIVELY LOOK FOR BUGS:**
1. READ the visible content above - look for typos, "undefined", "null", misspellings
2. Check if dropdown options make sense (no "undefined", "Error", or invalid options)
3. Test features by actually using them (add to cart, filters, sort, favorites)
4. Fill forms and submit them to test validation
5. Navigate to unexplored sections (Categories, Contact, Sign In, Cart)

**BUG HUNTING PRIORITY:**
1. FUNCTIONAL BUGS (HIGH): Features that don't work, "undefined" or "null" values displayed
2. DATA BUGS (MEDIUM): Wrong data, incorrect prices, broken images, console errors
3. TEXT BUGS (LOW): Typos, misspellings (report once, don't repeat)

**EXIT CRITERIA FOR CURRENT PAGE:**
- Ran broken image detector tool
- Clicked on at least 2-3 interactive elements
- Checked any dropdowns for errors
- Found bugs OR confirmed page works correctly
- Ready to move to next page

**AVOID REPETITION**: Check your history - don't repeat the same action on the same page.

${
  urlQueueContext
    ? `## URL Discovery Queue
${urlQueueContext}

**Navigation Strategy**: Consider visiting unvisited URLs to ensure complete application coverage. Prioritize auth pages first (register before login), then main features.

`
    : ''
}## Bug Reporting Guidelines
When reporting bugs in "observedIssues", ONLY report REAL bugs you can see RIGHT NOW:

✅ REPORT these (real bugs):
- "Typo: 'Contakt' should be 'Contact' in navigation menu"
- "Dropdown shows 'Error 101: Subject not found' instead of valid option"
- "Text shows 'UNDEFINED' instead of product category name"
- "Console error: 404 for /api/products endpoint"
- "Broken image: product thumbnail fails to load"

❌ DO NOT REPORT these (not bugs):
- "No issues found on this page" - this is not a bug!
- "Navigation to X not yet tested" - this is a task, not a bug
- "Page is focused on Contact" - this is a status update
- "Input accepts text, server response unknown" - speculation, not a bug
- "May contain broken images if any" - unconfirmed, not a bug

Each bug report should be a clear, specific statement of what IS wrong, not what MIGHT be wrong.

Respond with a JSON object:
\`\`\`json
{
  "action": "click|fill|navigate|select|hover|scroll|back|refresh|tool|done",
  "selector": "CSS selector (if applicable)",
  "value": "value to use (if applicable)",
  "toolName": "tool name (if action is 'tool')",
  "toolParams": {},
  "reasoning": "explanation of your decision",
  "confidence": 0.0-1.0,
  "hypothesis": "what you're testing",
  "expectedOutcome": "what you expect to happen",
  "observedIssues": ["ONLY include confirmed bugs you can see - be specific about what and where"]
}
\`\`\``;
}

import { PersonaAnalysis, PersonaSuggestion } from '../../domain/personas/TestingPersona';

/**
 * Build user prompt for decision request with persona suggestions.
 * Limits suggestions to top 5 per persona and prioritizes same-page actions.
 */
export function buildDecisionPromptWithPersonas(
  pageContext: {
    url: string;
    title: string;
    visibleText: string;
    elements: Array<{ selector: string; type: string; text: string; isVisible: boolean }>;
    consoleErrors: string[];
    networkErrors: string[];
  },
  history: Array<{
    step: number;
    action: { action: string; selector?: string; value?: string };
    success: boolean;
    resultingUrl: string;
  }>,
  tools: Array<{ name: string; description: string }>,
  personaAnalyses: PersonaAnalysis[],
  objective?: string,
  urlQueueContext?: string,
  reportedBugsSummary?: string
): string {
  const config = getPromptConfig();

  // Get base prompt with URL context and reported bugs
  const basePrompt = buildDecisionPrompt(
    pageContext,
    history,
    tools,
    objective,
    urlQueueContext,
    reportedBugsSummary
  );

  // Build persona suggestions section
  const relevantPersonas = personaAnalyses.filter(p => p.isRelevant && p.suggestions.length > 0);

  if (relevantPersonas.length === 0) {
    return basePrompt;
  }

  const personaSuggestionsText = relevantPersonas
    .map(persona => {
      // Limit to top N suggestions per persona, sorted by confidence
      const topSuggestions = persona.suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, config.context.maxPersonaSuggestions);

      const suggestionsText = topSuggestions
        .map((s, i) => {
          const actionStr = formatSuggestionAction(s);
          return `  ${i + 1}. ${actionStr}\n     Reasoning: ${s.reasoning}\n     Risk: ${s.riskLevel}, Confidence: ${Math.round(s.confidence * 100)}%`;
        })
        .join('\n');

      return `### ${persona.personaName} (top ${topSuggestions.length} of ${persona.suggestions.length})\n${suggestionsText}`;
    })
    .join('\n\n');

  // Count total suggestions shown
  const totalShown = relevantPersonas.reduce(
    (sum, p) => sum + Math.min(p.suggestions.length, config.context.maxPersonaSuggestions),
    0
  );

  const personaSection = `
## Testing Persona Suggestions (${totalShown} shown)
The following specialized testing personas have suggestions for this page.
**Focus on testing the current page first before navigating away.**

${personaSuggestionsText}

Consider these suggestions when deciding your next action. Prioritize:
1. Easy quick tests on the CURRENT page first
2. Security and validation issues
3. Tests that can reveal bugs quickly`;

  // Insert persona section before the final task section
  return basePrompt.replace('## Your Task', `${personaSection}\n\n## Your Task`);
}

/**
 * Format a persona suggestion action for display.
 */
function formatSuggestionAction(suggestion: PersonaSuggestion): string {
  const action = suggestion.action;

  switch (action.action) {
    case 'fill':
      const displayValue =
        (action.value?.length || 0) > 30 ? action.value?.substring(0, 30) + '...' : action.value;
      return `FILL "${action.selector}" with "${displayValue}"`;
    case 'click':
      return `CLICK "${action.selector}"`;
    case 'navigate':
      return `NAVIGATE to "${action.value}"`;
    case 'tool':
      return `RUN TOOL "${action.toolName}"`;
    default:
      return `${action.action?.toUpperCase()} ${action.selector || action.value || ''}`;
  }
}

/**
 * Prompt for analyzing findings.
 */
export const FINDING_ANALYSIS_PROMPT = `You are a QA expert analyzing a potential issue found during exploratory testing.

## Finding
{{finding}}

## Page Context
URL: {{url}}
Title: {{title}}

## Task
Analyze this finding and provide:
1. Severity: critical, high, medium, or low
2. Description: Clear explanation of the issue
3. Recommendation: How to fix or mitigate

Respond in JSON format:
\`\`\`json
{
  "severity": "critical|high|medium|low",
  "description": "...",
  "recommendation": "..."
}
\`\`\``;

/**
 * Prompt for generating session summary.
 */
export const SUMMARY_PROMPT = `You are summarizing an exploratory testing session.

## Session Statistics
- Total Steps: {{totalSteps}}
- Successful Actions: {{successfulActions}}
- Failed Actions: {{failedActions}}
- Pages Visited: {{pagesVisited}}

## Findings
{{findings}}

## Task
Generate a concise executive summary of this testing session, including:
1. Overview of what was tested
2. Key findings and their severity
3. Areas that need more attention
4. Recommendations for the development team

Write the summary in clear, professional language suitable for stakeholders.`;
