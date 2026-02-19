#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadEnvConfig } from './config/env.js';
import { FacebookToolHandlers } from './mcp/handlers.js';
import { logger } from './utils/logger.js';

const env = loadEnvConfig();

logger.info('Loaded tenant configuration', {
  tenantIds: Object.keys(env.tenantAccessMap),
  tenantAccessMap: Object.fromEntries(
    Object.entries(env.tenantAccessMap).map(([tenantId, cfg]) => [
      tenantId,
      {
        allowedAdAccountIds: cfg.allowedAdAccountIds,
        systemUserTokenRef: cfg.systemUserTokenRef,
      },
    ])
  ),
});

class FacebookMCPServer {
  private readonly server: Server;
  private readonly handlers: FacebookToolHandlers;
  private readonly httpApp: express.Express;

  constructor() {
    this.server = new Server({
      name: 'facebook-mcp-server',
      version: '2.0.0',
    });

    this.handlers = new FacebookToolHandlers();
    this.httpApp = express();

    this.setupHttpServer();
    this.setupToolHandlers();
  }

  private setupHttpServer(): void {
    this.httpApp.use(cors());
    this.httpApp.use(express.json({ limit: '2mb' }));

    this.httpApp.post('/mcp', async (req, res) => {
      const requestId = req.body?.id;
      const method = req.body?.method;

      try {
        if (method === 'tools/list') {
          res.json({
            id: requestId,
            jsonrpc: '2.0',
            result: { tools: this.handlers.getTools() },
          });
          return;
        }

        if (method === 'tools/call') {
          const toolName = req.body?.params?.name;
          const args = req.body?.params?.arguments;
          logger.info('HTTP MCP tool call', { toolName });

          const result = await this.handlers.handleToolCall(toolName, args);
          res.json({
            id: requestId,
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            },
          });
          return;
        }

        res.status(400).json({
          id: requestId,
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
        });
      } catch (error) {
        logger.error('HTTP MCP error', {
          method,
          message: error instanceof Error ? error.message : String(error),
        });

        res.status(500).json({
          id: requestId || null,
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    });

    this.httpApp.listen(env.port, () => {
      logger.info(`HTTP MCP server listening on port ${env.port}`);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.handlers.getTools() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info('Stdio MCP tool call', { toolName: name });
      const result = await this.handlers.handleToolCall(name, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Facebook MCP Server started');
  }
}

const server = new FacebookMCPServer();
server.start().catch((error) => {
  logger.error('Failed to start Facebook MCP Server', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
