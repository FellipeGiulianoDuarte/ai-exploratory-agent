import {
  Tool,
  ToolContext,
  ToolResult,
  ToolDefinition,
  ToolParameterSchema,
} from './Tool';

/**
 * Abstract base class for tools that provides common functionality.
 * All custom tools should extend this class.
 */
export abstract class BaseTool<TParams = unknown, TResult = unknown>
  implements Tool<TParams, TResult>
{
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Define the parameter schema for this tool.
   * Override in subclasses to specify parameters.
   */
  protected abstract getParameterSchema(): Record<string, ToolParameterSchema>;

  /**
   * The core execution logic for the tool.
   * Override in subclasses to implement tool functionality.
   */
  protected abstract executeInternal(
    params: TParams,
    context: ToolContext
  ): Promise<TResult>;

  /**
   * Get the tool definition for LLM function calling.
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.getParameterSchema(),
    };
  }

  /**
   * Validate parameters against the schema.
   */
  validateParams(params: TParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const schema = this.getParameterSchema();
    const paramObj = params as Record<string, unknown>;

    // Check required parameters
    for (const [key, def] of Object.entries(schema)) {
      if (def.required && (paramObj[key] === undefined || paramObj[key] === null)) {
        errors.push(`Missing required parameter: ${key}`);
        continue;
      }

      // Type checking for provided values
      if (paramObj[key] !== undefined && paramObj[key] !== null) {
        const actualType = Array.isArray(paramObj[key]) ? 'array' : typeof paramObj[key];
        if (actualType !== def.type) {
          errors.push(`Parameter ${key} must be of type ${def.type}, got ${actualType}`);
        }

        // Enum validation
        if (def.enum && !def.enum.includes(paramObj[key])) {
          errors.push(`Parameter ${key} must be one of: ${def.enum.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the tool with error handling and timing.
   */
  async execute(params: TParams, context: ToolContext): Promise<ToolResult<TResult>> {
    const startTime = Date.now();

    // Validate parameters first
    const validation = this.validateParams(params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Parameter validation failed: ${validation.errors.join('; ')}`,
        duration: Date.now() - startTime,
        toolName: this.name,
      };
    }

    try {
      const result = await this.executeInternal(params, context);
      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        toolName: this.name,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        toolName: this.name,
      };
    }
  }
}
