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
  appendAiRunEvent,
  markAiRunFinished,
  markAiRunRunning,
} from '@/lib/ai-execution/run-store';
import {
  getExecutionSession,
  updateExecutionSession,
} from '@/lib/ai-execution/session-store';
import type { CreatedEntityIds, ExecutionStep, ExecutionStreamEvent } from '@/lib/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function logTimelineEvent(
  runId: string | undefined,
  eventType: string,
  fields: { stepId?: string; status?: string; summary?: string; label?: string }
) {
  const parts = [`[AI-RUN ${runId ?? '?'}] ${eventType}`];
  if (fields.stepId) parts.push(`step=${fields.stepId}`);
  if (fields.label) parts.push(`label=${fields.label}`);
  if (fields.status) parts.push(`status=${fields.status}`);
  if (fields.summary) parts.push(fields.summary);
  console.log(parts.join(' | '));
}

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
        const runId = session.runId;
        const sentStepSignatures = new Map<string, string>();

        const send = (event: string, payload: ExecutionStreamEvent) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        };
        const persistEvent = async (payload: {
          type: string;
          stepId?: string;
          label?: string;
          summary?: string;
          status?: string;
          userTitle?: string;
          userMessage?: string;
          rationale?: string;
          debugJson?: Record<string, unknown>;
          createdIdsJson?: Record<string, unknown> | null;
          ts?: string;
        }) => {
          if (!runId) return;
          try {
            await appendAiRunEvent({
              runId,
              type: payload.type,
              stepId: payload.stepId,
              label: payload.label,
              summary: payload.summary,
              status: payload.status,
              userTitle: payload.userTitle,
              userMessage: payload.userMessage,
              rationale: payload.rationale,
              debugJson: payload.debugJson,
              createdIdsJson: payload.createdIdsJson,
              ts: payload.ts,
            });
          } catch {
            // Keep streaming resilient if persistence is transiently unavailable.
          }
        };
        const sendTimelineStart = async (persist = false) => {
          const ts = new Date().toISOString();
          send('timeline.start', {
            type: 'timeline.start',
            runId,
            executionId,
            ts,
          });
          if (persist) {
            await persistEvent({
              type: 'timeline.start',
              ts,
            });
          }
        };
        const sendStepEvent = async (step: ExecutionStep) => {
          const signature = JSON.stringify({
            status: step.status,
            summary: step.summary,
            userTitle: step.userTitle,
            userMessage: step.userMessage,
            nextSteps: step.nextSteps,
            rationale: step.rationale,
            finishedAt: step.finishedAt,
            attempts: step.attempts,
          });
          const knownSignature = sentStepSignatures.get(step.id);
          if (knownSignature === signature) return;
          sentStepSignatures.set(step.id, signature);

          let eventType: 'step.start' | 'step.update' | 'step.success' | 'step.error' = 'step.update';
          if (step.status === 'success') eventType = 'step.success';
          else if (step.status === 'error') eventType = 'step.error';
          else if (!knownSignature && step.status === 'running') eventType = 'step.start';

          const ts = step.finishedAt || step.startedAt || new Date().toISOString();
          const payload: ExecutionStreamEvent = {
            type: eventType,
            runId,
            stepId: step.id,
            label: step.title,
            status: step.status,
            summary: step.summary,
            userTitle: step.userTitle,
            userMessage: step.userMessage,
            nextSteps: step.nextSteps,
            rationale: step.rationale,
            debug: step.debug || undefined,
            ids: step.createdIds,
            ts,
            step,
          };
          send(eventType, payload);
          logTimelineEvent(runId, eventType, {
            stepId: step.id,
            label: step.title,
            status: step.status,
            summary: step.summary,
          });
          await persistEvent({
            type: eventType,
            stepId: step.id,
            label: step.title,
            summary: step.summary,
            status: step.status,
            userTitle: step.userTitle,
            userMessage: step.userMessage,
            rationale: step.rationale,
            debugJson: {
              step,
              meta: step.meta || {},
              technicalDetails: step.technicalDetails,
            },
            createdIdsJson: (step.createdIds || null) as Record<string, unknown> | null,
            ts,
          });
        };
        const replaySteps = async () => {
          const current = getExecutionSession(executionId);
          if (!current) return;
          for (const step of current.steps) {
            await sendStepEvent(step);
          }
        };
        const sendTimelineDone = async (
          input: {
            success: boolean;
            summary: any;
            createdIds?: CreatedEntityIds;
            ts?: string;
          },
          persist = false
        ) => {
          const ts = input.ts || new Date().toISOString();
          const doneSummary = {
            ...input.summary,
            createdIds: input.createdIds || input.summary?.createdIds,
          };
          send('execution_summary', {
            type: 'execution_summary',
            summary: doneSummary,
          });
          send('timeline.done', {
            type: 'timeline.done',
            runId,
            success: input.success,
            createdIds: input.createdIds,
            summary: doneSummary,
            ts,
          });
          logTimelineEvent(runId, 'timeline.done', {
            status: input.success ? 'success' : 'error',
            summary: doneSummary.finalMessage || (input.success ? 'Run succeeded' : 'Run failed'),
          });
          if (persist) {
            await persistEvent({
              type: 'timeline.done',
              status: input.success ? 'success' : 'error',
              debugJson: { summary: doneSummary },
              createdIdsJson: (input.createdIds || null) as Record<string, unknown> | null,
              ts,
            });
            if (runId) {
              await markAiRunFinished({
                runId,
                success: input.success,
                createdIdsJson: (input.createdIds || null) as Record<string, unknown> | null,
                summaryJson: doneSummary as Record<string, unknown>,
                retries: typeof doneSummary.retries === 'number' ? doneSummary.retries : undefined,
                finishedAt: ts,
              }).catch(() => undefined);
            }
          }
        };
        const sendLegacyExecutionError = (message: string, details?: Record<string, unknown>) => {
          send('execution_error', {
            type: 'execution_error',
            error: {
              message,
              ...(details || {}),
            },
          });
        };

        try {
          const currentSession = getExecutionSession(executionId);
          if (!currentSession) {
            send('execution_error', {
              type: 'execution_error',
              error: { message: 'Execution session is no longer available.' },
            });
            await sendTimelineDone({
              success: false,
              summary: {
                stepsCompleted: 0,
                totalSteps: 0,
                retries: 0,
                finalStatus: 'error',
                finalMessage: 'Execution session expired.',
              },
            }, false);
            controller.close();
            return;
          }

          if (currentSession.status === 'completed' || currentSession.status === 'error') {
            await sendTimelineStart(false);
            await replaySteps();
            if (currentSession.blockingError) {
              sendLegacyExecutionError(currentSession.blockingError.message, currentSession.blockingError as any);
            } else if (currentSession.lastError) {
              sendLegacyExecutionError(currentSession.lastError);
            }
            if (currentSession.summary) {
              await sendTimelineDone({
                success: currentSession.summary.finalStatus === 'success',
                summary: currentSession.summary,
                createdIds: currentSession.summary.createdIds,
              }, false);
            } else {
              await sendTimelineDone({
                success: currentSession.status === 'completed',
                summary: {
                  stepsCompleted: currentSession.steps.filter((step) => step.status === 'success').length,
                  totalSteps: Math.max(1, currentSession.steps.length),
                  retries: currentSession.steps.reduce(
                    (sum, step) => sum + Math.max(0, (step.attempts || 1) - 1),
                    0
                  ),
                  finalStatus: currentSession.status === 'completed' ? 'success' : 'error',
                  finalMessage: currentSession.lastError || currentSession.message || 'Execution finished.',
                },
              }, false);
            }
            controller.close();
            return;
          }

          if (currentSession.status === 'running') {
            await sendTimelineStart(false);
            await replaySteps();
            let completed = false;
            let lastSeenUpdatedAt = currentSession.updatedAt;
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
              if (next.updatedAt !== lastSeenUpdatedAt) {
                lastSeenUpdatedAt = next.updatedAt;
                for (const step of next.steps) {
                  await sendStepEvent(step);
                }
              }
              if (next.status === 'completed' || next.status === 'error') {
                if (next.summary) {
                  if (next.blockingError) {
                    sendLegacyExecutionError(next.blockingError.message, next.blockingError as any);
                  } else if (next.lastError) {
                    sendLegacyExecutionError(next.lastError);
                  }
                  await sendTimelineDone({
                    success: next.summary.finalStatus === 'success',
                    summary: next.summary,
                    createdIds: next.summary.createdIds,
                  }, false);
                } else {
                  await sendTimelineDone({
                    success: next.status === 'completed',
                    summary: {
                      stepsCompleted: next.steps.filter((step) => step.status === 'success').length,
                      totalSteps: Math.max(1, next.steps.length),
                      retries: next.steps.reduce(
                        (sum, step) => sum + Math.max(0, (step.attempts || 1) - 1),
                        0
                      ),
                      finalStatus: next.status === 'completed' ? 'success' : 'error',
                      finalMessage: next.lastError || next.message || 'Execution finished.',
                    },
                  }, false);
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
          await sendTimelineStart(true);
          if (runId) {
            await markAiRunRunning(runId).catch(() => undefined);
          }

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
              await sendStepEvent(_step);
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
            sendLegacyExecutionError(result.blockingError.message, result.blockingError as any);
          }
          await sendTimelineDone({
            success: result.success,
            summary: result.summary,
            createdIds: result.createdIds || result.summary.createdIds,
          }, true);

          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown stream error';
          updateExecutionSession(executionId, (prev) => ({
            ...prev,
            status: 'error',
            lastError: message,
          }));
          sendLegacyExecutionError(message);
          await sendTimelineDone({
            success: false,
            summary: {
              stepsCompleted: 0,
              totalSteps: 0,
              retries: 0,
              finalStatus: 'error',
              finalMessage: message,
            },
          }, true);
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
