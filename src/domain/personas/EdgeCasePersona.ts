import { PageContext as LLMPageContext } from '../exploration/PageContext';
import { ActionDecision } from '../exploration/ActionTypes';
import { TestingPersona, PersonaSuggestion } from './TestingPersona';

/**
 * The Edge Case Agent - Boundary testing and edge cases
 *
 * Focuses on testing boundary conditions, edge cases, off-by-one errors,
 * and unusual but valid inputs.
 */
export class EdgeCasePersona implements TestingPersona {
  readonly id = 'edgecase';
  readonly name = 'Edge Case Agent';
  readonly description = 'Tests boundary conditions, limits, and edge cases';
  readonly priority = 6;

  // Common boundary values
  private boundaryValues = {
    numbers: [
      { value: '0', reason: 'Zero boundary' },
      { value: '-1', reason: 'Negative one (off-by-one)' },
      { value: '1', reason: 'Minimum positive' },
      { value: '2147483647', reason: 'Max 32-bit signed integer' },
      { value: '-2147483648', reason: 'Min 32-bit signed integer' },
      { value: '9007199254740991', reason: 'Max safe JavaScript integer' },
      { value: '0.1', reason: 'Floating point precision' },
      { value: '0.0000001', reason: 'Very small decimal' },
      { value: '99', reason: 'Just under 100' },
      { value: '100', reason: 'Round number boundary' },
      { value: '101', reason: 'Just over 100' },
      { value: '999', reason: 'Just under 1000' },
      { value: '1000', reason: 'Round number boundary' },
    ],
    strings: [
      { value: '', reason: 'Empty string' },
      { value: ' ', reason: 'Single space' },
      { value: '   ', reason: 'Multiple spaces' },
      { value: '\t', reason: 'Tab character' },
      { value: '\n', reason: 'Newline character' },
      { value: 'a', reason: 'Single character' },
      { value: 'A'.repeat(255), reason: '255 characters (common limit)' },
      { value: 'A'.repeat(256), reason: '256 characters (power of 2)' },
      { value: 'A'.repeat(1000), reason: '1000 characters' },
    ],
    dates: [
      { value: '1970-01-01', reason: 'Unix epoch' },
      { value: '1999-12-31', reason: 'Pre-Y2K' },
      { value: '2000-01-01', reason: 'Y2K date' },
      { value: '2038-01-19', reason: 'Unix 32-bit overflow date' },
      { value: '2099-12-31', reason: 'Far future' },
      { value: '0000-01-01', reason: 'Year zero' },
      { value: '9999-12-31', reason: 'Max year' },
      { value: '2024-02-29', reason: 'Leap year day' },
      { value: '2023-02-29', reason: 'Invalid leap year day' },
    ],
    email: [
      { value: 'a@b.c', reason: 'Minimal valid email' },
      { value: 'test+tag@example.com', reason: 'Email with plus sign' },
      { value: 'test.email@sub.domain.com', reason: 'Email with dots' },
      { value: '"test@test"@example.com', reason: 'Quoted email' },
      { value: 'a@b', reason: 'Email without TLD' },
      { value: '@example.com', reason: 'Email without local part' },
      { value: 'test@', reason: 'Email without domain' },
    ],
  };

  analyzeAndSuggest(
    context: LLMPageContext,
    _history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[] {
    const suggestions: PersonaSuggestion[] = [];

    // Find numeric inputs
    const numericInputs = context.elements.filter(
      el =>
        el.type === 'input' &&
        (el.selector.includes('number') ||
          el.selector.includes('quantity') ||
          el.selector.includes('amount') ||
          el.selector.includes('price') ||
          el.selector.includes('age') ||
          el.selector.includes('count') ||
          el.selector.includes('size') ||
          el.selector.includes('qty'))
    );

    for (const input of numericInputs) {
      const elementId = this.getElementIdentifier(input);

      // Test key boundary values
      const keyBoundaries = [
        this.boundaryValues.numbers[0], // 0
        this.boundaryValues.numbers[1], // -1
        this.boundaryValues.numbers[2], // 1
        this.boundaryValues.numbers[6], // 0.1
      ];

      for (const boundary of keyBoundaries) {
        suggestions.push({
          action: {
            action: 'fill',
            selector: input.selector,
            value: boundary.value,
          },
          reasoning: `${boundary.reason} in ${elementId}`,
          riskLevel: 'safe',
          expectedFindingType: 'boundary_error',
          confidence: 0.7,
        });
      }
    }

    // Find text inputs
    const textInputs = context.elements.filter(el => el.type === 'input' || el.type === 'textarea');

    for (const input of textInputs) {
      const elementId = this.getElementIdentifier(input);

      // Empty and whitespace tests
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '',
        },
        reasoning: `Empty input in ${elementId}`,
        riskLevel: 'safe',
        expectedFindingType: 'validation_error',
        confidence: 0.8,
      });

      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '   ',
        },
        reasoning: `Whitespace-only in ${elementId}`,
        riskLevel: 'safe',
        expectedFindingType: 'validation_error',
        confidence: 0.75,
      });
    }

    // Find date inputs
    const dateInputs = context.elements.filter(
      el =>
        el.selector.includes('date') ||
        el.selector.includes('birthday') ||
        el.selector.includes('dob')
    );

    for (const input of dateInputs) {
      const elementId = this.getElementIdentifier(input);
      const keyDates = [
        this.boundaryValues.dates[0], // Unix epoch
        this.boundaryValues.dates[7], // Leap year
        this.boundaryValues.dates[8], // Invalid leap year
      ];

      for (const date of keyDates) {
        suggestions.push({
          action: {
            action: 'fill',
            selector: input.selector,
            value: date.value,
          },
          reasoning: `${date.reason} in ${elementId}`,
          riskLevel: 'safe',
          expectedFindingType: 'date_handling_error',
          confidence: 0.7,
        });
      }
    }

    // Find email inputs
    const emailInputs = context.elements.filter(
      el => el.selector.includes('email') || (el.type === 'input' && el.selector.includes('mail'))
    );

    for (const input of emailInputs) {
      const elementId = this.getElementIdentifier(input);
      const keyEmails = [
        this.boundaryValues.email[0], // Minimal
        this.boundaryValues.email[1], // Plus sign
        this.boundaryValues.email[4], // No TLD
      ];

      for (const email of keyEmails) {
        suggestions.push({
          action: {
            action: 'fill',
            selector: input.selector,
            value: email.value,
          },
          reasoning: `${email.reason} in ${elementId}`,
          riskLevel: 'safe',
          expectedFindingType: 'email_validation_error',
          confidence: 0.7,
        });
      }
    }

    // Find select elements for boundary testing
    const selects = context.elements.filter(el => el.type === 'select');

    for (const select of selects) {
      const elementId = this.getElementIdentifier(select);
      suggestions.push({
        action: {
          action: 'select',
          selector: select.selector,
          value: '', // Try selecting nothing
        },
        reasoning: `Empty selection in ${elementId}`,
        riskLevel: 'safe',
        expectedFindingType: 'select_validation_error',
        confidence: 0.65,
      });
    }

    // Pagination edge cases (if detected)
    if (
      context.url.includes('page=') ||
      context.elements.some(
        el =>
          el.selector.includes('pagination') ||
          el.text?.includes('Next') ||
          el.text?.includes('Previous')
      )
    ) {
      const pageUrl = context.url.replace(/page=\d+/, 'page=0');
      suggestions.push({
        action: {
          action: 'navigate',
          value: pageUrl,
        },
        reasoning: 'Edge case: Page 0 (zero-indexed pagination)',
        riskLevel: 'safe',
        expectedFindingType: 'pagination_error',
        confidence: 0.7,
      });

      const negativePageUrl = context.url.replace(/page=\d+/, 'page=-1');
      suggestions.push({
        action: {
          action: 'navigate',
          value: negativePageUrl,
        },
        reasoning: 'Edge case: Negative page number',
        riskLevel: 'safe',
        expectedFindingType: 'pagination_error',
        confidence: 0.7,
      });

      const largePageUrl = context.url.replace(/page=\d+/, 'page=999999');
      suggestions.push({
        action: {
          action: 'navigate',
          value: largePageUrl,
        },
        reasoning: 'Edge case: Very large page number',
        riskLevel: 'safe',
        expectedFindingType: 'pagination_error',
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  getSystemPromptAddition(): string {
    return `You are in EDGE CASE MODE. Your goal is to test boundaries and limits.

## Numeric Boundaries
- Test 0, -1, 1 (off-by-one errors)
- Test maximum values (2147483647, 9007199254740991)
- Test minimum values (-2147483648)
- Test decimals (0.1, 0.0000001)
- Test round number boundaries (99, 100, 101, 999, 1000)

## String Boundaries
- Empty strings
- Single characters
- Very long strings (255, 256, 1000+ chars)
- Whitespace only (spaces, tabs, newlines)

## Date Boundaries
- Unix epoch (1970-01-01)
- Y2K dates (1999-12-31, 2000-01-01)
- Leap year dates (2024-02-29)
- Invalid dates (2023-02-29)
- Far future dates

## Pagination & Lists
- Page 0, Page -1
- Very large page numbers
- Empty results handling

## General Edge Cases
- First/Last items in lists
- Empty collections
- Maximum allowed quantities
- Minimum required values`;
  }

  isRelevant(context: LLMPageContext): boolean {
    // Edge case testing is relevant when there are input fields or URL parameters
    return (
      context.elements.some(
        el => el.type === 'input' || el.type === 'textarea' || el.type === 'select'
      ) ||
      context.url.includes('?') ||
      context.url.includes('page=') ||
      context.url.includes('id=')
    );
  }

  /**
   * Extract a readable identifier from an element for display in suggestions.
   */
  private getElementIdentifier(element: LLMPageContext['elements'][0]): string {
    // Prefer text content if available and meaningful
    if (element.text && element.text.trim().length > 0) {
      const truncatedText =
        element.text.length > 20 ? element.text.substring(0, 20) + '...' : element.text;
      return `"${truncatedText}"`;
    }

    // Extract meaningful parts from selector
    const selector = element.selector;

    // Try to extract ID
    const idMatch = selector.match(/#([\w-]+)/);
    if (idMatch) {
      return `#${idMatch[1]}`;
    }

    // Try to extract name or other attributes
    const nameMatch = selector.match(/\[name=["']?([\w-]+)["']?\]/);
    if (nameMatch) {
      return `[name="${nameMatch[1]}"]`;
    }

    const placeholderMatch = selector.match(/\[placeholder=["']?([^"'\]]+)["']?\]/);
    if (placeholderMatch) {
      const truncated =
        placeholderMatch[1].length > 20
          ? placeholderMatch[1].substring(0, 20) + '...'
          : placeholderMatch[1];
      return `[${truncated}]`;
    }

    // Fall back to element type
    return element.type || 'element';
  }
}
