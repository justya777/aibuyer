import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { MCPClient } from '@/lib/mcp-client';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { runAiExecution } from '@/lib/ai-execution/executor';
import {
  getExecutionSession,
  updateExecutionSession,
} from '@/lib/ai-execution/session-store';
import type { ExecutionStreamEvent } from '@/lib/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'OPENAI_API_KEY is missing. Set it in frontend/.env.local or root .env and restart dev server.'
    );
  }
  return new OpenAI({ apiKey });
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get('executionId');
    if (!executionId) {
      return new Response('Missing executionId', { status: 400 });
    }

    const session = getExecutionSession(executionId);
    if (!session) {
      return new Response('Execution not found', { status: 404 });
    }
    if (session.userId !== context.userId || session.tenantId !== context.tenantId) {
      return new Response('Execution access denied', { status: 403 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let mcpClient: MCPClient | null = null;
        const send = (event: string, payload: ExecutionStreamEvent) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        };
        const sendStepReplay = () => {
          const current = getExecutionSession(executionId);
          if (!current) return;
          for (const step of current.steps) {
            send('step_update', { type: 'step_update', step });
          }
        };

        try {
          const currentSession = getExecutionSession(executionId);
          if (!currentSession) {
            send('execution_error', {
              type: 'execution_error',
              error: { message: 'Execution session is no longer available.' },
            });
            send('done', {
              type: 'done',
              summary: {
                stepsCompleted: 0,
                totalSteps: 0,
                retries: 0,
                finalStatus: 'error',
                finalMessage: 'Execution session expired.',
              },
            });
            controller.close();
            return;
          }

          if (currentSession.status === 'completed' || currentSession.status === 'error') {
            sendStepReplay();
            if (currentSession.blockingError) {
              send('execution_error', {
                type: 'execution_error',
                error: currentSession.blockingError,
              });
            } else if (currentSession.lastError) {
              send('execution_error', {
                type: 'execution_error',
                error: { message: currentSession.lastError },
              });
            }
            if (currentSession.summary) {
              send('execution_summary', {
                type: 'execution_summary',
                summary: currentSession.summary,
              });
              send('done', {
                type: 'done',
                summary: currentSession.summary,
              });
            }
            controller.close();
            return;
          }

          if (currentSession.status === 'running') {
            sendStepReplay();
            let completed = false;
            while (!completed) {
              await sleep(300);
              const next = getExecutionSession(executionId);
              if (!next) {
                completed = true;
                send('execution_error', {
                  type: 'execution_error',
                  error: { message: 'Execution session ended unexpectedly.' },
                });
                break;
              }
              if (next.status === 'completed' || next.status === 'error') {
                if (next.summary) {
                  send('execution_summary', {
                    type: 'execution_summary',
                    summary: next.summary,
                  });
                  if (next.blockingError) {
                    send('execution_error', {
                      type: 'execution_error',
                      error: next.blockingError,
                    });
                  } else if (next.lastError) {
                    send('execution_error', {
                      type: 'execution_error',
                      error: { message: next.lastError },
                    });
                  }
                  send('done', {
                    type: 'done',
                    summary: next.summary,
                  });
                }
                completed = true;
              }
            }
            controller.close();
            return;
          }

          updateExecutionSession(executionId, (prev) => ({
            ...prev,
            status: 'running',
          }));

          const openai = getOpenAIClient();
          mcpClient = new MCPClient(context);
          const result = await runAiExecution({
            openai,
            mcpClient,
            command: currentSession.command,
            accountId: currentSession.accountId,
            businessId: currentSession.businessId,
            tenantId: currentSession.tenantId,
            requestCookie: currentSession.requestCookie,
            onStepUpdate: async (_step, allSteps) => {
              updateExecutionSession(executionId, (prev) => ({
                ...prev,
                steps: allSteps,
              }));
              send('step_update', { type: 'step_update', step: _step });
            },
          });

          updateExecutionSession(executionId, (prev) => ({
            ...prev,
            status: result.success ? 'completed' : 'error',
            steps: result.steps,
            summary: result.summary,
            reasoning: result.reasoning,
            message: result.message,
            blockingError: result.blockingError,
            lastError: result.success ? undefined : result.message,
          }));

          if (result.blockingError) {
            send('execution_error', {
              type: 'execution_error',
              error: result.blockingError,
            });
          }
          send('execution_summary', {
            type: 'execution_summary',
            summary: result.summary,
          });
          send('done', {
            type: 'done',
            summary: result.summary,
          });

          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown stream error';
          updateExecutionSession(executionId, (prev) => ({
            ...prev,
            status: 'error',
            lastError: message,
          }));
          send('execution_error', {
            type: 'execution_error',
            error: { message },
          });
          send('done', {
            type: 'done',
            summary: {
              stepsCompleted: 0,
              totalSteps: 0,
              retries: 0,
              finalStatus: 'error',
              finalMessage: message,
            },
          });
          controller.close();
        } finally {
          mcpClient?.destroy();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return new Response(error.message, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return new Response(error.message, { status: 403 });
    }
    return new Response(error instanceof Error ? error.message : 'Unknown error', {
      status: 500,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
