import { PageContext as LLMPageContext } from '../exploration/PageContext';
import { ActionDecision } from '../exploration/ActionTypes';
import { TestingPersona, PersonaSuggestion } from './TestingPersona';

/**
 * The Validation Agent - "Is this what we expect?"
 *
 * Focuses on verifying that the page displays correctly, looking for
 * visual errors, incorrect data, error messages, and unexpected states.
 */
export class ValidationPersona implements TestingPersona {
  readonly id = 'validation';
  readonly name = 'Validation Agent';
  readonly description = 'Verifies page correctness, looks for errors and unexpected states';
  readonly priority = 8;

  // Patterns that indicate errors on the page
  private errorPatterns = [
    /error/i,
    /exception/i,
    /failed/i,
    /failure/i,
    /invalid/i,
    /undefined/i,
    /null/i,
    /NaN/i,
    /not found/i,
    /404/i,
    /500/i,
    /something went wrong/i,
    /oops/i,
    /try again/i,
    /cannot/i,
    /unable to/i,
  ];

  // Patterns that indicate incomplete/broken UI
  private brokenUIPatterns = [
    /loading\.{3,}/i,
    /\[object Object\]/i,
    /undefined/i,
    /null/i,
    /NaN/i,
    /TODO/i,
    /FIXME/i,
    /Lorem ipsum/i,
    /placeholder/i,
  ];

  analyzeAndSuggest(
    context: LLMPageContext,
    _history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[] {
    const suggestions: PersonaSuggestion[] = [];
    const observations = this.analyzePageState(context);

    // If there are console errors, suggest investigating
    if (context.consoleErrors && context.consoleErrors.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'analyze_console_errors',
        },
        reasoning: `Found ${context.consoleErrors.length} console error(s) that need investigation`,
        intent: 'Diagnose potential JavaScript failures',
        verification: 'Check if errors are benign or affect critical functionality',
        riskLevel: 'safe',
        expectedFindingType: 'console_error',
        confidence: 0.95,
      });
    }

    // If there are network errors, suggest investigating
    if (context.networkErrors && context.networkErrors.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'analyze_network_errors',
        },
        reasoning: `Found ${context.networkErrors.length} network error(s) that need investigation`,
        intent: 'Identify failed API calls or resource loads',
        verification: 'Determine impact on page data or features',
        riskLevel: 'safe',
        expectedFindingType: 'network_error',
        confidence: 0.95,
      });
    }

    // Check for broken images
    const imageElements = context.elements.filter(el => el.type === 'image');
    if (imageElements.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'find_broken_images',
        },
        reasoning: 'Page has images that should be verified for proper loading',
        intent: 'Detect assets that failed to load',
        verification: 'List of all broken image URLs on the page',
        riskLevel: 'safe',
        expectedFindingType: 'broken_image',
        confidence: 0.8,
      });
    }

    // If errors detected in page content, take screenshot
    if (observations.hasVisibleErrors) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'screenshot',
        },
        reasoning: 'Visible error messages detected - capturing evidence',
        intent: 'Document visual proof of errors',
        verification: 'Screenshot saved to artifacts',
        riskLevel: 'safe',
        expectedFindingType: 'visible_error',
        confidence: 0.9,
      });
    }

    // If broken UI patterns detected
    if (observations.hasBrokenUI) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'screenshot',
        },
        reasoning: 'Potential broken UI detected (placeholder text, undefined values)',
        intent: 'Capture evidence of incomplete or broken UI',
        verification: 'Screenshot saved showing the defects',
        riskLevel: 'safe',
        expectedFindingType: 'broken_ui',
        confidence: 0.85,
      });
    }

    // Check empty states
    const emptyContainers = context.elements.filter(
      el =>
        el.selector.includes('list') ||
        el.selector.includes('grid') ||
        el.selector.includes('container') ||
        el.selector.includes('results')
    );

    if (emptyContainers.length > 0 && (!context.visibleText || context.visibleText.length < 100)) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'screenshot',
        },
        reasoning: 'Page may be showing empty state - verify if intentional',
        intent: 'Check if empty state is handled gracefully',
        verification: 'Verify if "No results" message or similar is displayed',
        riskLevel: 'safe',
        expectedFindingType: 'empty_state',
        confidence: 0.6,
      });
    }

    // Verify forms have labels
    const inputs = context.elements.filter(el => el.type === 'input');
    const inputsWithoutLabels = inputs.filter(el => !el.text);

    if (inputsWithoutLabels.length > 0) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'accessibility_check',
        },
        reasoning: `Found ${inputsWithoutLabels.length} input(s) potentially missing labels`,
        intent: 'Assess accessibility compliance',
        verification: 'Report of accessibility violations requiring fix',
        riskLevel: 'safe',
        expectedFindingType: 'accessibility_issue',
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  private analyzePageState(context: LLMPageContext): {
    hasVisibleErrors: boolean;
    hasBrokenUI: boolean;
    errorMessages: string[];
    brokenUIIndicators: string[];
  } {
    const text = context.visibleText || '';
    const errorMessages: string[] = [];
    const brokenUIIndicators: string[] = [];

    // Check for error patterns
    for (const pattern of this.errorPatterns) {
      const match = text.match(pattern);
      if (match) {
        errorMessages.push(match[0]);
      }
    }

    // Check for broken UI patterns
    for (const pattern of this.brokenUIPatterns) {
      const match = text.match(pattern);
      if (match) {
        brokenUIIndicators.push(match[0]);
      }
    }

    return {
      hasVisibleErrors: errorMessages.length > 0,
      hasBrokenUI: brokenUIIndicators.length > 0,
      errorMessages,
      brokenUIIndicators,
    };
  }

  getSystemPromptAddition(): string {
    return `You are in VALIDATION MODE. Your goal is to verify correctness.

## What to Look For
- Error messages visible on the page
- Unexpected "undefined", "null", "NaN" values
- Placeholder text that shouldn't be shown (Lorem ipsum, TODO)
- Empty states that seem wrong
- Broken layouts or misaligned elements
- Missing images or icons
- Inconsistent data (totals don't match, counts are off)

## Console & Network Errors
- JavaScript errors in console indicate bugs
- Failed network requests indicate broken functionality
- 4xx/5xx status codes need investigation
- CORS errors often indicate configuration issues

## Data Validation
- Verify displayed data makes sense
- Check if numbers and dates are formatted correctly
- Look for truncated text or missing information
- Compare what's shown vs what was entered`;
  }

  isRelevant(_context: LLMPageContext): boolean {
    // Validation is always relevant
    return true;
  }
}
