import { BaseTool } from '../../../src/domain/tools/BaseTool';
import { ToolContext, ToolParameterSchema } from '../../../src/domain/tools/Tool';

// Concrete implementation for testing
class TestTool extends BaseTool<{ name: string; count?: number }, string> {
  readonly name = 'test_tool';
  readonly description = 'A tool for testing BaseTool functionality';

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {
      name: {
        type: 'string',
        description: 'Name parameter',
        required: true,
      },
      count: {
        type: 'number',
        description: 'Optional count',
        required: false,
        default: 1,
      },
    };
  }

  protected async executeInternal(
    params: { name: string; count?: number },
    _context: ToolContext
  ): Promise<string> {
    return `Hello, ${params.name}! Count: ${params.count ?? 1}`;
  }
}

// Tool that throws errors
class FailingTool extends BaseTool<Record<string, never>, void> {
  readonly name = 'failing_tool';
  readonly description = 'A tool that always fails';

  protected getParameterSchema(): Record<string, ToolParameterSchema> {
    return {};
  }

  protected async executeInternal(): Promise<void> {
    throw new Error('Intentional failure');
  }
}

describe('BaseTool', () => {
  let tool: TestTool;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new TestTool();
    mockContext = {
      browser: {} as ToolContext['browser'],
      currentUrl: 'https://example.com',
    };
  });

  describe('getDefinition', () => {
    it('should return tool definition', () => {
      const definition = tool.getDefinition();

      expect(definition.name).toBe('test_tool');
      expect(definition.description).toBe('A tool for testing BaseTool functionality');
      expect(definition.parameters).toHaveProperty('name');
      expect(definition.parameters).toHaveProperty('count');
    });

    it('should include parameter details', () => {
      const definition = tool.getDefinition();

      expect(definition.parameters.name.type).toBe('string');
      expect(definition.parameters.name.required).toBe(true);
      expect(definition.parameters.count.type).toBe('number');
      expect(definition.parameters.count.required).toBe(false);
    });
  });

  describe('validateParams', () => {
    it('should validate valid parameters', () => {
      const result = tool.validateParams({ name: 'Test' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required parameters', () => {
      const result = tool.validateParams({} as { name: string });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: name');
    });

    it('should detect wrong parameter types', () => {
      const result = tool.validateParams({
        name: 'Test',
        count: 'not a number' as unknown as number,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be of type number');
    });

    it('should accept valid optional parameters', () => {
      const result = tool.validateParams({ name: 'Test', count: 5 });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const result = await tool.execute({ name: 'World' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, World! Count: 1');
      expect(result.toolName).toBe('test_tool');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute with optional parameters', async () => {
      const result = await tool.execute({ name: 'World', count: 3 }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, World! Count: 3');
    });

    it('should fail with invalid parameters', async () => {
      const result = await tool.execute({} as { name: string }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter validation failed');
    });

    it('should handle execution errors gracefully', async () => {
      const failingTool = new FailingTool();
      const result = await failingTool.execute({}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Intentional failure');
      expect(result.toolName).toBe('failing_tool');
    });

    it('should track execution duration', async () => {
      const result = await tool.execute({ name: 'Test' }, mockContext);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
