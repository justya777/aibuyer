#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadEnvConfig } from './config/env.js';
import { FacebookToolHandlers } from './mcp/handlers.js';
import { logger } from './utils/logger.js';
import { TenantIsolationError } from './fb/core/types.js';
import { DsaAutofillPermissionDeniedError, DsaComplianceError } from './fb/dsa.js';
import { PageResolutionError } from './fb/core/page-resolution.js';
import { PaymentMethodRequiredError } from './fb/accounts.js';

const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

const env = loadEnvConfig();

logger.info('Environment loaded', {
  graphApiVersion: env.graphApiVersion,
  graphMaxRetries: env.graphRetry.maxRetries,
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
        const isTenantIsolation = error instanceof TenantIsolationError;
        const isDsaCompliance = error instanceof DsaComplianceError;
        const isDsaAutofillPermissionDenied = error instanceof DsaAutofillPermissionDeniedError;
        const isDefaultPageRequired = error instanceof PageResolutionError;
        const isPaymentMethodRequired = error instanceof PaymentMethodRequiredError;
        const statusCode =
          isTenantIsolation || isDsaAutofillPermissionDenied
            ? 403
            : isDsaCompliance || isDefaultPageRequired || isPaymentMethodRequired
              ? 422
              : 500;
        logger.error('HTTP MCP error', {
          method,
          message: error instanceof Error ? error.message : String(error),
          status: statusCode,
        });

        res.status(statusCode).json({
          id: requestId || null,
          jsonrpc: '2.0',
          error: {
            code:
              isTenantIsolation || isDsaAutofillPermissionDenied
                ? 403
                : isDsaCompliance || isDefaultPageRequired || isPaymentMethodRequired
                  ? 422
                  : -32603,
            message: isTenantIsolation
              ? 'Forbidden'
              : isDsaAutofillPermissionDenied
                ? 'PERMISSION_DENIED'
              : isDsaCompliance
                ? 'DSA_REQUIRED'
                : isDefaultPageRequired
                  ? 'DEFAULT_PAGE_REQUIRED'
                  : isPaymentMethodRequired
                    ? 'PAYMENT_METHOD_REQUIRED'
                : 'Internal error',
            data:
              error instanceof DsaComplianceError
                ? {
                    code: error.code,
                    message: error.message,
                    nextSteps: error.nextSteps,
                    partial: false,
                    success: false,
                  }
                : error instanceof PageResolutionError
                  ? {
                      code: error.code,
                      message: error.message,
                      nextSteps: [
                        'Open tenant ad account settings.',
                        'Select and save a default page for this ad account.',
                        'Retry the campaign workflow.',
                      ],
                      partial: false,
                      success: false,
                    }
                : error instanceof DsaAutofillPermissionDeniedError
                  ? {
                      code: error.code,
                      message: error.message,
                      partial: false,
                      success: false,
                    }
                : error instanceof PaymentMethodRequiredError
                  ? {
                      code: error.code,
                      message: error.message,
                      nextSteps: error.nextSteps,
                      partial: false,
                      success: false,
                    }
                : error instanceof Error
                  ? error.message
                  : 'Unknown error',
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
