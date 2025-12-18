/**
 * Tests for persona suggestion clarity and uniqueness.
 * Ensures that suggestions for different elements have distinct reasoning strings.
 */

import { ChaosPersona } from '../../../src/domain/personas/ChaosPersona';
import { EdgeCasePersona } from '../../../src/domain/personas/EdgeCasePersona';
import { PageContext } from '../../../src/domain/exploration/PageContext';

describe('Persona Suggestion Clarity', () => {
  describe('ChaosPersona', () => {
    it('should generate unique reasoning for different input elements', () => {
      const persona = new ChaosPersona();

      // Create a page context with multiple input fields
      const context: PageContext = {
        url: 'https://example.com/form',
        title: 'Test Form',
        visibleText: 'Test form content',
        elements: [
          {
            selector: 'input[name="username"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
          {
            selector: 'input[name="email"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
          {
            selector: 'input[name="password"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = persona.analyzeAndSuggest(context, []);

      // Extract all reasoning strings
      const reasonings = suggestions.map(s => s.reasoning);

      // Group by test type (empty value, long input, etc.)
      const emptyValueSuggestions = reasonings.filter(r => r.includes('empty value'));

      // Verify that suggestions for different elements have different reasoning
      // Should be 3 different inputs, each with their own empty value test
      expect(emptyValueSuggestions.length).toBe(3);

      // All reasoning strings should be unique (include element identifier)
      const uniqueEmptyReasonings = new Set(emptyValueSuggestions);
      expect(uniqueEmptyReasonings.size).toBe(3);

      // Each reasoning should include the element identifier
      for (const reasoning of emptyValueSuggestions) {
        expect(reasoning).toMatch(/in \[name="(username|email|password)"\]/);
      }
    });

    it('should extract readable identifiers from element text', () => {
      const persona = new ChaosPersona();

      const context: PageContext = {
        url: 'https://example.com',
        title: 'Test',
        visibleText: 'Test',
        elements: [
          {
            selector: 'button.submit',
            type: 'button',
            text: 'Submit',
            isVisible: true,
          },
          {
            selector: 'button.save',
            type: 'button',
            text: 'Save',
            isVisible: true,
          },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = persona.analyzeAndSuggest(context, []);
      const reasonings = suggestions.map(s => s.reasoning);

      // Should use button text as identifier
      const hasSubmitButton = reasonings.some(r => r.includes('"Submit"'));
      const hasSaveButton = reasonings.some(r => r.includes('"Save"'));

      expect(hasSubmitButton).toBe(true);
      expect(hasSaveButton).toBe(true);
    });

    it('should extract ID from selector when no text available', () => {
      const persona = new ChaosPersona();

      const context: PageContext = {
        url: 'https://example.com',
        title: 'Test',
        visibleText: 'Test',
        elements: [
          {
            selector: 'input#username',
            type: 'input',
            text: '',
            isVisible: true,
          },
          {
            selector: 'input#email',
            type: 'input',
            text: '',
            isVisible: true,
          },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = persona.analyzeAndSuggest(context, []);
      const reasonings = suggestions.map(s => s.reasoning);

      // Should use element ID as identifier
      const hasUsernameId = reasonings.some(r => r.includes('#username'));
      const hasEmailId = reasonings.some(r => r.includes('#email'));

      expect(hasUsernameId).toBe(true);
      expect(hasEmailId).toBe(true);
    });
  });

  describe('EdgeCasePersona', () => {
    it('should generate unique reasoning for different input elements', () => {
      const persona = new EdgeCasePersona();

      const context: PageContext = {
        url: 'https://example.com/form',
        title: 'Test Form',
        visibleText: 'Test form content',
        elements: [
          {
            selector: 'input[name="firstName"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
          {
            selector: 'input[name="lastName"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = persona.analyzeAndSuggest(context, []);
      const reasonings = suggestions.map(s => s.reasoning);

      // Extract empty input suggestions
      const emptyInputSuggestions = reasonings.filter(r => r.includes('Empty input'));

      // Should have 2 suggestions (one per input field)
      expect(emptyInputSuggestions.length).toBe(2);

      // All should be unique
      const uniqueReasonings = new Set(emptyInputSuggestions);
      expect(uniqueReasonings.size).toBe(2);

      // Each should reference the specific field
      expect(emptyInputSuggestions.some(r => r.includes('firstName'))).toBe(true);
      expect(emptyInputSuggestions.some(r => r.includes('lastName'))).toBe(true);
    });

    it('should differentiate numeric boundary tests for different fields', () => {
      const persona = new EdgeCasePersona();

      const context: PageContext = {
        url: 'https://example.com',
        title: 'Test',
        visibleText: 'Test',
        elements: [
          {
            selector: 'input[name="quantity"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
          {
            selector: 'input[name="price"]',
            type: 'input',
            text: '',
            isVisible: true,
          },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = persona.analyzeAndSuggest(context, []);
      const reasonings = suggestions.map(s => s.reasoning);

      // Check for zero boundary tests
      const zeroTests = reasonings.filter(r => r.includes('Zero boundary'));

      // Should have 2 zero tests (one per numeric input)
      expect(zeroTests.length).toBe(2);

      // All should be unique
      expect(new Set(zeroTests).size).toBe(2);

      // Should reference the specific fields
      expect(zeroTests.some(r => r.includes('quantity'))).toBe(true);
      expect(zeroTests.some(r => r.includes('price'))).toBe(true);
    });
  });

  describe('Persona Suggestion Uniqueness', () => {
    it('should not generate duplicate reasoning strings for the same test type', () => {
      const chaosPersona = new ChaosPersona();

      const context: PageContext = {
        url: 'https://example.com',
        title: 'Test',
        visibleText: 'Test',
        elements: [
          { selector: 'input[name="field1"]', type: 'input', text: '', isVisible: true },
          { selector: 'input[name="field2"]', type: 'input', text: '', isVisible: true },
          { selector: 'input[name="field3"]', type: 'input', text: '', isVisible: true },
        ],
        consoleErrors: [],
        networkErrors: [],
      };

      const suggestions = chaosPersona.analyzeAndSuggest(context, []);
      const reasonings = suggestions.map(s => s.reasoning);

      // Count occurrences of each reasoning string
      const reasoningCounts = new Map<string, number>();
      for (const reasoning of reasonings) {
        reasoningCounts.set(reasoning, (reasoningCounts.get(reasoning) || 0) + 1);
      }

      // No reasoning should appear more than once (except navigation tests which apply globally)
      const duplicates = Array.from(reasoningCounts.entries()).filter(
        ([reasoning, count]) => count > 1 && !reasoning.includes('navigate')
      );

      if (duplicates.length > 0) {
        console.error('Duplicate reasonings found:', duplicates);
      }

      expect(duplicates.length).toBe(0);
    });
  });
});
