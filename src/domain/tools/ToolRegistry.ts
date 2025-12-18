import { Tool, ToolContext, ToolResult, ToolDefinition } from './Tool';

/**
 * Registry for managing and invoking tools.
 * Provides centralized tool registration and lookup.
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool with the registry.
   * @throws Error if a tool with the same name is already registered
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool from the registry.
   */
  unregister(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * Get a tool by name.
   */
  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Check if a tool is registered.
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get all registered tool names.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions for LLM function calling.
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.getDefinition());
  }

  /**
   * Invoke a tool by name with the given parameters and context.
   */
  async invoke<TResult = unknown>(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<ToolResult<TResult>> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found in registry`,
        duration: 0,
        toolName,
      };
    }

    return tool.execute(params, context) as Promise<ToolResult<TResult>>;
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools.
   */
  clear(): void {
    this.tools.clear();
  }
}

// Default singleton instance
let defaultRegistry: ToolRegistry | null = null;

/**
 * Get the default tool registry instance.
 */
export function getDefaultToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();
  }
  return defaultRegistry;
}

/**
 * Reset the default tool registry (mainly for testing).
 */
export function resetDefaultToolRegistry(): void {
  defaultRegistry = null;
}
