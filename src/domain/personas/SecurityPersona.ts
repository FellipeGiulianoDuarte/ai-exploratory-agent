import { PageContext as LLMPageContext } from '../exploration/PageContext';
import { ActionDecision } from '../exploration/ActionTypes';
import { TestingPersona, PersonaSuggestion } from './TestingPersona';

/**
 * The Security Agent - "Is this secure?"
 *
 * Focuses on finding security vulnerabilities including XSS, SQL injection,
 * IDOR, CSRF, and other common security issues.
 */
export class SecurityPersona implements TestingPersona {
  readonly id = 'security';
  readonly name = 'Security Agent';
  readonly description = 'Identifies security vulnerabilities and injection attacks';
  readonly priority = 10; // Highest priority

  // Common XSS payloads
  private xssPayloads = [
    '<script>alert("XSS")</script>',
    '"><script>alert("XSS")</script>',
    "'-alert('XSS')-'",
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    'javascript:alert("XSS")',
    '<body onload=alert("XSS")>',
    '{{constructor.constructor("alert(1)")()}}',
    '${alert("XSS")}',
    '<iframe src="javascript:alert(\'XSS\')">',
  ];

  // Common SQL injection payloads
  private sqlPayloads = [
    "' OR '1'='1",
    "' OR '1'='1' --",
    "'; DROP TABLE users; --",
    "1' AND '1'='1",
    '1 UNION SELECT NULL,NULL,NULL--',
    "' UNION SELECT username,password FROM users--",
    '1; SELECT * FROM users',
    "admin'--",
    "1' ORDER BY 1--",
    "' OR 1=1#",
  ];

  // IDOR patterns to test
  private idorPatterns = [
    {
      original: /\/user\/(\d+)/,
      test: (id: string) => [
        `/user/${parseInt(id) + 1}`,
        `/user/${parseInt(id) - 1}`,
        '/user/1',
        '/user/0',
      ],
    },
    {
      original: /\/order\/(\d+)/,
      test: (id: string) => [
        `/order/${parseInt(id) + 1}`,
        `/order/${parseInt(id) - 1}`,
        '/order/1',
      ],
    },
    {
      original: /\/account\/(\d+)/,
      test: (id: string) => [`/account/${parseInt(id) + 1}`, `/account/1`],
    },
    {
      original: /id=(\d+)/,
      test: (id: string) => [`id=${parseInt(id) + 1}`, `id=${parseInt(id) - 1}`, 'id=1'],
    },
  ];

  analyzeAndSuggest(
    context: LLMPageContext,
    _history: Array<{ action: ActionDecision; success: boolean }>
  ): PersonaSuggestion[] {
    const suggestions: PersonaSuggestion[] = [];

    // Get all input fields
    const inputs = context.elements.filter(el => el.type === 'input' || el.type === 'textarea');

    // XSS testing on all inputs
    for (const input of inputs) {
      // Basic XSS
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: this.xssPayloads[0],
        },
        reasoning: 'Test for reflected XSS vulnerability with script tag injection',
        intent: 'Attempt to execute arbitrary JavaScript',
        verification: 'Check if alert box appears or script is executed',
        riskLevel: 'moderate',
        expectedFindingType: 'xss_vulnerability',
        confidence: 0.8,
      });

      // Event handler XSS
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: this.xssPayloads[3],
        },
        reasoning: 'Test for XSS via event handler injection',
        intent: 'Bypass filters by using event handlers',
        verification: 'Check if event triggers script execution',
        riskLevel: 'moderate',
        expectedFindingType: 'xss_vulnerability',
        confidence: 0.75,
      });

      // Template injection
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: this.xssPayloads[7],
        },
        reasoning: 'Test for template injection vulnerability',
        intent: 'Inject template syntax to execute code',
        verification: 'Check if template expression is evaluated',
        riskLevel: 'moderate',
        expectedFindingType: 'template_injection',
        confidence: 0.7,
      });
    }

    // SQL injection on inputs that might query database
    const dbInputs = inputs.filter(
      el =>
        el.selector.includes('search') ||
        el.selector.includes('query') ||
        el.selector.includes('username') ||
        el.selector.includes('email') ||
        el.selector.includes('id') ||
        el.selector.includes('login') ||
        el.selector.includes('filter')
    );

    for (const input of dbInputs) {
      // Basic SQL injection
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: this.sqlPayloads[0],
        },
        reasoning: 'Test for SQL injection vulnerability with OR bypass',
        intent: 'Bypass authentication or retrieve unauthorized data',
        verification: 'Check for successful login or database error messages',
        riskLevel: 'moderate',
        expectedFindingType: 'sql_injection',
        confidence: 0.85,
      });

      // Union-based SQL injection
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: this.sqlPayloads[4],
        },
        reasoning: 'Test for UNION-based SQL injection',
        intent: 'Extract data from other tables',
        verification: 'Check if additional data rows appear in results',
        riskLevel: 'moderate',
        expectedFindingType: 'sql_injection',
        confidence: 0.75,
      });
    }

    // IDOR testing based on URL patterns
    for (const pattern of this.idorPatterns) {
      const match = context.url.match(pattern.original);
      if (match) {
        const testUrls = pattern.test(match[1]);
        for (const testUrl of testUrls.slice(0, 2)) {
          const newUrl = context.url.replace(pattern.original, testUrl);
          suggestions.push({
            action: {
              action: 'navigate',
              value: newUrl,
            },
            reasoning: `Test for IDOR vulnerability by accessing different resource ID`,
            intent: 'Access resources belonging to other users',
            verification: 'Check if access is granted or denied',
            riskLevel: 'moderate',
            expectedFindingType: 'idor_vulnerability',
            confidence: 0.9,
          });
        }
      }
    }

    // Check for sensitive data exposure in page content
    if (this.hasSensitiveDataExposure(context)) {
      suggestions.push({
        action: {
          action: 'tool',
          toolName: 'analyze_page',
        },
        reasoning: 'Page may contain sensitive data exposure - analyze content',
        intent: 'Identify leaked PII or secrets',
        verification: 'Confirm if exposed data is sensitive/confidential',
        riskLevel: 'safe',
        expectedFindingType: 'sensitive_data_exposure',
        confidence: 0.9,
      });
    }

    // Check for missing security headers (observation, not action)
    // This would be better handled by a dedicated tool

    // Path traversal on file-related inputs
    const fileInputs = inputs.filter(
      el =>
        el.selector.includes('file') ||
        el.selector.includes('path') ||
        el.selector.includes('document')
    );

    for (const input of fileInputs) {
      suggestions.push({
        action: {
          action: 'fill',
          selector: input.selector,
          value: '../../../etc/passwd',
        },
        reasoning: 'Test for path traversal vulnerability',
        intent: 'Access system files via directory traversal',
        verification: 'Check if file content is returned or error message appears',
        riskLevel: 'moderate',
        expectedFindingType: 'path_traversal',
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  private hasSensitiveDataExposure(context: LLMPageContext): boolean {
    const sensitivePatterns = [
      /password/i,
      /api[_-]?key/i,
      /secret/i,
      /token/i,
      /credit[_-]?card/i,
      /ssn|social[_-]?security/i,
      /private[_-]?key/i,
    ];

    const text = context.visibleText || '';
    return sensitivePatterns.some(pattern => pattern.test(text));
  }

  getSystemPromptAddition(): string {
    return `You are in SECURITY MODE. Your goal is to find vulnerabilities.

## XSS Testing
- Try injecting <script> tags in all input fields
- Test event handlers: onerror, onload, onclick
- Check for template injection: {{...}}, \${...}
- Test javascript: URLs in links and redirects

## SQL Injection Testing
- Try ' OR '1'='1 in login forms and search fields
- Test UNION-based injection for data extraction
- Look for error messages revealing database info
- Test numeric inputs with 1 OR 1=1

## IDOR Testing
- Change IDs in URLs to access other users' data
- Try sequential IDs (1, 2, 3) to enumerate resources
- Check if authorization is properly enforced

## Other Security Checks
- Look for sensitive data in page source/responses
- Check for missing HTTPS on sensitive forms
- Test for open redirects in URL parameters
- Look for CSRF tokens (or lack thereof) in forms`;
  }

  isRelevant(context: LLMPageContext): boolean {
    // Security testing is always relevant, but especially for:
    // - Pages with forms
    // - Pages with user data
    // - Authentication pages
    // - URLs with IDs
    return (
      context.elements.some(el => el.type === 'input' || el.type === 'form') ||
      context.url.includes('login') ||
      context.url.includes('auth') ||
      context.url.includes('admin') ||
      /\/\d+/.test(context.url) ||
      context.url.includes('id=')
    );
  }
}
