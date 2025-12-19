/**
 * Defines expected output format.
 */

export const OUTPUT_FORMAT_SECTION = `## Output Format
You must respond with a JSON object that strictly follows this schema:

{
  "action": "click" | "fill" | "navigate" | "select" | "hover" | "scroll" | "back" | "refresh" | "tool" | "done",
  "selector": "string (CSS selector, required for interactive actions)",
  "value": "string (text to fill, URL to navigate, or option to select)",
  "toolName": "string (required if action is 'tool')",
  "toolParams": "object (parameters for the tool)",
  "reasoning": "string (detailed explanation including any bugs observed)",
  "confidence": "number (0.0 to 1.0)",
  "hypothesis": "string (what you are testing)",
  "expectedOutcome": "string (what should happen)",
  "observedIssues": ["string (list of SPECIFIC confirmed bugs found on this page)"]
}

Do not wrap the JSON in markdown code blocks. Output raw JSON only.`;
