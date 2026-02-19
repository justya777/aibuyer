export class MCPClient {
  private requestId = 1;
  private readonly defaultTenantId: string | undefined;

  constructor() {
    this.defaultTenantId = process.env.FACEBOOK_TENANT_ID || process.env.TENANT_ID;
    console.log('MCP Client initialized - using direct API calls');
  }

  async callTool(toolName: string, params: any): Promise<any> {
    const resolvedParams =
      this.defaultTenantId && params && typeof params === 'object' && !params.tenantId
        ? { ...params, tenantId: this.defaultTenantId }
        : params;

    console.log(`MCP Client: Direct call to ${toolName} with params:`, resolvedParams);
    
    try {
      // Make direct HTTP call to our internal MCP server
      const response = await fetch('http://localhost:3001/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          id: this.requestId++,
          params: {
            name: toolName,
            arguments: resolvedParams
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`MCP Client: Received result from ${toolName}:`, result);
      
      if (result.error) {
        throw new Error(result.error.message || 'MCP Error');
      }

      // Parse the result content if it's a text response
      if (result.result && result.result.content && Array.isArray(result.result.content)) {
        const textContent = result.result.content.find((c: any) => c.type === 'text');
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent.text);
            console.log(`MCP Client: Parsed result for ${toolName}:`, parsed);
            return parsed;
          } catch {
            console.log(`MCP Client: Failed to parse JSON, returning raw text for ${toolName}:`, textContent.text);
            return textContent.text;
          }
        }
      }
      
      return result.result;
    } catch (error) {
      console.error(`MCP Client: Failed to call tool ${toolName}:`, error);
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
      console.error('Failed to list tools:', error);
      return { tools: [] };
    }
  }


  destroy() {
    // Cleanup if needed
    console.log('MCP Client destroyed');
  }
}
