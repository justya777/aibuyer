export class MCPClient {
  private requestId = 1;
  private static readonly TOOL_TIMEOUT_MS = 90_000;
  private readonly context: {
    tenantId: string;
    userId?: string;
    isPlatformAdmin?: boolean;
  };

  constructor(context: { tenantId: string; userId?: string; isPlatformAdmin?: boolean }) {
    this.context = context;
  }

  async callTool(toolName: string, params: any): Promise<any> {
    const resolvedParams =
      params && typeof params === 'object'
        ? {
            ...params,
            tenantId: this.context.tenantId,
            userId: this.context.userId,
            isPlatformAdmin: this.context.isPlatformAdmin,
          }
        : {
            tenantId: this.context.tenantId,
            userId: this.context.userId,
            isPlatformAdmin: this.context.isPlatformAdmin,
          };
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MCPClient.TOOL_TIMEOUT_MS);

      // Make direct HTTP call to our internal MCP server
      const response = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          id: this.requestId++,
          params: {
            name: toolName,
            arguments: resolvedParams
          }
        })
      }).finally(() => {
        clearTimeout(timeout);
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const rawErrorMessage =
          result?.error?.data || result?.error?.message || `HTTP error! status: ${response.status}`;
        const errorMessage =
          typeof rawErrorMessage === 'string' ? rawErrorMessage : JSON.stringify(rawErrorMessage);
        throw new Error(errorMessage);
      }
      
      if (result.error) {
        throw new Error(result.error.data || result.error.message || 'MCP Error');
      }

      // Parse the result content if it's a text response
      if (result.result && result.result.content && Array.isArray(result.result.content)) {
        const textContent = result.result.content.find((c: any) => c.type === 'text');
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent.text);
            return parsed;
          } catch {
            return textContent.text;
          }
        }
      }
      
      return result.result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `MCP tool "${toolName}" timed out after ${MCPClient.TOOL_TIMEOUT_MS / 1000}s`
        );
      }
      throw error;
    }
  }

  async listTools(): Promise<any> {
    try {
      const response = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: this.requestId++,
          params: {}
        })
      });

      return await response.json();
    } catch (error) {
      return { tools: [] };
    }
  }


  destroy() {
    // No-op cleanup hook for compatibility.
  }
}
