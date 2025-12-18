/**
 * Defines expected output format.
 */

export const OUTPUT_FORMAT_SECTION = `## Output Format
You must respond with a JSON object containing your decision. Always include:
- action: The action type to perform
- reasoning: Why you chose this action (include any bugs you observed!)
- confidence: Your confidence score (0-1)
- hypothesis: What you're testing (if applicable)
- expectedOutcome: What you expect to happen
- observedIssues: List any bugs/issues you noticed on the current page`;
