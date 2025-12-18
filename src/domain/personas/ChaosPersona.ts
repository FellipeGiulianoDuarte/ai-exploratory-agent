import { LLMPageContext, ActionDecision } from '../../application/ports/LLMPort';
import { TestingPersona, PersonaSuggestion } from './TestingPersona';

/**
 * The Chaos Agent - "How can I break this?"
 * 
 * Focuses on destructive testing, finding ways to cause errors,
 * unexpected states, and application crashes.
 */
export class ChaosPersona implements TestingPersona {
  readonly id = 'chaos';
  readonly name = 'Chaos Agent';
  readonly description = 'Finds ways to break things through unexpected inputs and actions';
  readonly priority = 7;

  analyzeAndSuggest(
    context: LLMPageContext,
    _history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[] {
    const suggestions: PersonaSuggestion[] = [];

    // Look for input fields to abuse
    const inputs = context.elements.filter(el => 
      el.type === 'input' || el.type === 'textarea'
    );

    for (const input of inputs) {
      // Empty submission test
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '',
        },
        reasoning: 'Submit empty value to test validation',
        riskLevel: 'safe',
        expectedFindingType: 'validation_error',
        confidence: 0.8,
      });

      // Extremely long input
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: 'A'.repeat(10000),
        },
        reasoning: 'Test with extremely long input to check buffer/length handling',
        riskLevel: 'moderate',
        expectedFindingType: 'input_handling',
        confidence: 0.7,
      });

      // Special characters
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '!@#$%^&*(){}[]|\\:";\'<>?,./`~',
        },
        reasoning: 'Test special character handling',
        riskLevel: 'safe',
        expectedFindingType: 'input_handling',
        confidence: 0.75,
      });

      // Unicode and emoji
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '测试 🔥 тест العربية',
        },
        reasoning: 'Test unicode and emoji handling',
        riskLevel: 'safe',
        expectedFindingType: 'encoding_error',
        confidence: 0.7,
      });

      // Null bytes and control characters
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: 'test\x00null\x1Fcontrol',
        },
        reasoning: 'Test null byte and control character handling',
        riskLevel: 'moderate',
        expectedFindingType: 'security_vulnerability',
        confidence: 0.6,
      });
    }

    // Look for buttons to rapid-fire click
    const buttons = context.elements.filter(el => 
      el.type === 'button' || el.type === 'submit'
    );

    for (const button of buttons) {
      if (button.text?.toLowerCase().includes('submit') || 
          button.text?.toLowerCase().includes('save') ||
          button.text?.toLowerCase().includes('add')) {
        suggestions.push({
          action: {
            action: 'click',
            selector: button.selector,
          },
          reasoning: 'Rapid click to test race conditions and double-submit handling',
          riskLevel: 'moderate',
          expectedFindingType: 'race_condition',
          confidence: 0.6,
        });
      }
    }

    // Look for numeric inputs
    const numericInputs = context.elements.filter(el => 
      el.selector.includes('quantity') || 
      el.selector.includes('amount') ||
      el.selector.includes('price') ||
      el.selector.includes('number')
    );

    for (const input of numericInputs) {
      // Negative numbers
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '-999999',
        },
        reasoning: 'Test negative number handling',
        riskLevel: 'moderate',
        expectedFindingType: 'business_logic',
        confidence: 0.8,
      });

      // Decimal edge cases
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '0.0000001',
        },
        reasoning: 'Test decimal precision handling',
        riskLevel: 'safe',
        expectedFindingType: 'calculation_error',
        confidence: 0.7,
      });

      // Very large numbers
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '999999999999999999',
        },
        reasoning: 'Test integer overflow handling',
        riskLevel: 'moderate',
        expectedFindingType: 'overflow_error',
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  getSystemPromptAddition(): string {
    return `You are in CHAOS MODE. Your goal is to break things.
- Try unexpected inputs: empty, very long, special characters, unicode
- Look for ways to cause errors, crashes, or unexpected states
- Test what happens when you do things out of order
- Try to submit forms multiple times rapidly
- Use negative numbers, zero, and very large numbers
- Look for input fields without proper validation
- Try to access pages/features in unintended ways`;
  }

  isRelevant(context: LLMPageContext): boolean {
    // Chaos testing is relevant when there are interactive elements
    return context.elements.some(el => 
      el.type === 'input' || 
      el.type === 'button' || 
      el.type === 'textarea' ||
      el.type === 'select'
    );
  }
}
