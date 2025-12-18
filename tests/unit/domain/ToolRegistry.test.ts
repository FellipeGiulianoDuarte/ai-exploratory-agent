import { ToolRegistry, resetDefaultToolRegistry, getDefaultToolRegistry } from '../../../src/domain/tools/ToolRegistry';
import { Tool, ToolContext, ToolResult, ToolDefinition } from '../../../src/domain/tools/Tool';

// Mock tool implementation for testing
class MockTool implements Tool<{ value: string }, string> {
  constructor(
    public readonly name: string,
    public readonly description: string
  ) {}

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        value: {
          type: 'string',
          description: 'Test value',
          required: true,
        },
      },
    };
  }

  validateParams(params: { value: string }): { valid: boolean; errors: string[] } {
    if (!params.value) {
      return { valid: false, errors: ['value is required'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(
    params: { value: string },
    _context: ToolContext
  ): Promise<ToolResult<string>> {
    return {
      success: true,
      data: `Executed with value: ${params.value}`,
      duration: 10,
      toolName: this.name,
    };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    resetDefaultToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = new MockTool('test_tool', 'A test tool');
      registry.register(tool);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw error when registering duplicate tool', () => {
      const tool1 = new MockTool('test_tool', 'First tool');
      const tool2 = new MockTool('test_tool', 'Second tool');

      registry.register(tool1);

      expect(() => registry.register(tool2)).toThrow(
        "Tool with name 'test_tool' is already registered"
      );
    });

    it('should register multiple tools', () => {
      registry.register(new MockTool('tool1', 'Tool 1'));
      registry.register(new MockTool('tool2', 'Tool 2'));
      registry.register(new MockTool('tool3', 'Tool 3'));

      expect(registry.size).toBe(3);
      expect(registry.getToolNames()).toEqual(['tool1', 'tool2', 'tool3']);
    });
  });

  describe('unregister', () => {
    it('should unregister a tool', () => {
      const tool = new MockTool('test_tool', 'A test tool');
      registry.register(tool);

      expect(registry.unregister('test_tool')).toBe(true);
      expect(registry.has('test_tool')).toBe(false);
    });

    it('should return false when unregistering non-existent tool', () => {
      expect(registry.unregister('non_existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should get a registered tool', () => {
      const tool = new MockTool('test_tool', 'A test tool');
      registry.register(tool);

      const retrieved = registry.get('test_tool');
      expect(retrieved).toBe(tool);
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('non_existent')).toBeUndefined();
    });
  });

  describe('getToolDefinitions', () => {
    it('should return definitions for all registered tools', () => {
      registry.register(new MockTool('tool1', 'Tool 1'));
      registry.register(new MockTool('tool2', 'Tool 2'));

      const definitions = registry.getToolDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions[0].name).toBe('tool1');
      expect(definitions[1].name).toBe('tool2');
    });

    it('should return empty array when no tools registered', () => {
      expect(registry.getToolDefinitions()).toEqual([]);
    });
  });

  describe('invoke', () => {
    it('should invoke a registered tool', async () => {
      const tool = new MockTool('test_tool', 'A test tool');
      registry.register(tool);

      const mockContext: ToolContext = {
        browser: {} as ToolContext['browser'],
        currentUrl: 'https://example.com',
      };

      const result = await registry.invoke<string>(
        'test_tool',
        { value: 'test' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('Executed with value: test');
    });

    it('should return error for non-existent tool', async () => {
      const mockContext: ToolContext = {
        browser: {} as ToolContext['browser'],
        currentUrl: 'https://example.com',
      };

      const result = await registry.invoke('non_existent', {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool 'non_existent' not found");
    });
  });

  describe('clear', () => {
    it('should clear all registered tools', () => {
      registry.register(new MockTool('tool1', 'Tool 1'));
      registry.register(new MockTool('tool2', 'Tool 2'));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getToolNames()).toEqual([]);
    });
  });

  describe('getDefaultToolRegistry', () => {
    it('should return singleton instance', () => {
      const instance1 = getDefaultToolRegistry();
      const instance2 = getDefaultToolRegistry();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetDefaultToolRegistry', () => {
      const instance1 = getDefaultToolRegistry();
      instance1.register(new MockTool('test', 'Test'));

      resetDefaultToolRegistry();

      const instance2 = getDefaultToolRegistry();
      expect(instance2.size).toBe(0);
      expect(instance1).not.toBe(instance2);
    });
  });
});
