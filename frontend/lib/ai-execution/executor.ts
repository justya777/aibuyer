import OpenAI from 'openai';
import { buildSystemPrompt, parseTrackingUrl } from '../campaign-config';
import { MCPClient } from '../mcp-client';
import type {
  CreatedEntityIds,
  ExecutionBlockingError,
  ExecutionStep,
  ExecutionSummary,
} from '../../../shared/types';
import { normalizeExecutionError } from './error-normalizer';
import { parseTargetingConstraints, enforceTargetingConstraints } from './constraint-parser';
import { facebookTools } from './facebook-tools';
import {
  appendStepFixes,
  createStepRegistry,
  getToolStepDescriptor,
  listExecutionSteps,
  markStepError,
  markStepRetrying,
  markStepSuccess,
  registerStepAttempt,
} from './step-factory';

type RawAction = {
  type: string;
  tool: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
  success: boolean;
};

export interface RunAiExecutionInput {
  openai: OpenAI;
  mcpClient: MCPClient;
  command: string;
  accountId: string;
  businessId?: string;
  tenantId: string;
  requestCookie?: string | null;
  onStepUpdate?: (step: ExecutionStep, allSteps: ExecutionStep[]) => Promise<void> | void;
}

export interface RunAiExecutionResult {
  steps: ExecutionStep[];
  summary: ExecutionSummary;
  reasoning: string;
  message: string;
  success: boolean;
  createdIds?: CreatedEntityIds;
  blockingError?: ExecutionBlockingError;
}

export async function runAiExecution(input: RunAiExecutionInput): Promise<RunAiExecutionResult> {
  const { openai, mcpClient, command, accountId, businessId, tenantId, requestCookie, onStepUpdate } = input;
  const appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const internalHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
  };
  if (requestCookie) {
    internalHeaders['cookie'] = requestCookie;
  }

  const stepRegistry = createStepRegistry();
  const emitStep = async (step: ExecutionStep | null) => {
    if (!step || !onStepUpdate) return;
    const all = listExecutionSteps(stepRegistry).map(cloneStep);
    await onStepUpdate(cloneStep(step), all);
  };

  let availableMaterials: any[] = [];
  let commandMaterials: any[] = [];
  let materialAssignments: Record<string, any> = {};

  try {
    const materialsResponse = await fetch(
      `${appBaseUrl}/api/get-materials?adName=${encodeURIComponent(accountId)}`,
      {
        method: 'GET',
        headers: internalHeaders,
      }
    );
    if (materialsResponse.ok) {
      const materialsData = await materialsResponse.json();
      availableMaterials = materialsData.materials || [];
    }

    if (availableMaterials.length === 0) {
      const allMaterialsResponse = await fetch(`${appBaseUrl}/api/get-materials`, {
        method: 'GET',
        headers: internalHeaders,
      });
      if (allMaterialsResponse.ok) {
        const allMaterialsData = await allMaterialsResponse.json();
        availableMaterials = allMaterialsData.materials || [];
      }
    }

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const recentMaterials = availableMaterials.filter((m: any) => {
      const uploadedAt = new Date(m.uploadedAt);
      return uploadedAt > tenMinutesAgo;
    });

    const commandLower = command.toLowerCase();
    const hasUploadedWithCommand =
      commandLower.includes('uploaded files') ||
      commandLower.includes('uploaded materials') ||
      commandLower.includes('use them from uploaded') ||
      commandLower.includes('with uploaded') ||
      commandLower.includes('use uploaded');

    const hasSpecificFilenames = availableMaterials.some(
      (m: any) =>
        commandLower.includes(m.originalName.toLowerCase()) ||
        commandLower.includes(m.filename.toLowerCase())
    );

    if (hasSpecificFilenames) {
      commandMaterials = availableMaterials.filter(
        (m: any) =>
          commandLower.includes(m.originalName.toLowerCase()) ||
          commandLower.includes(m.filename.toLowerCase())
      );
    } else if (recentMaterials.length > 0) {
      commandMaterials = recentMaterials.slice(0, 5);
    } else if (hasUploadedWithCommand || availableMaterials.length > 0) {
      commandMaterials = availableMaterials.slice(0, 5);
    }
  } catch {
    // Keep execution resilient when materials endpoints are unavailable.
  }

  if (availableMaterials.length > 0) {
    try {
      const assignmentResponse = await fetch(`${appBaseUrl}/api/material-assignment`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ command, materials: availableMaterials }),
      });
      if (assignmentResponse.ok) {
        const assignmentData = await assignmentResponse.json();
        materialAssignments = assignmentData.assignments || {};
      }
    } catch {
      materialAssignments = {};
    }
  }

  const materialsInfo = buildMaterialsInfo(commandMaterials, availableMaterials);
  const systemPrompt = buildSystemPrompt(
    accountId,
    materialsInfo,
    Object.keys(materialAssignments).length > 0 ? materialAssignments : undefined
  );

  const actions: RawAction[] = [];
  const adsMatch = command.match(/(\d+)\s*ads?/i);
  const requestedAdCount = adsMatch ? parseInt(adsMatch[1], 10) : 1;
  const materialAssignmentsList = buildMaterialAssignmentsList(
    command,
    commandMaterials,
    requestedAdCount
  );

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Parse and execute this command: "${command}"` },
  ];

  let conversationComplete = false;
  let campaignId: string | null = null;
  const toolFailureCounts: Record<string, number> = {};
  const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
  let blockingError: string | null = null;
  const isManagementCommand = isManagementStyleCommand(command);

  let iteration = 0;
  while (!conversationComplete && iteration < 15) {
    iteration += 1;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano-2025-04-14',
      max_tokens: 4000,
      messages,
      tools: facebookTools,
      tool_choice: 'auto',
    });

    const message = completion.choices[0]?.message;
    if (!message) break;
    messages.push(message);

    if (!message.tool_calls) {
      conversationComplete = true;
      continue;
    }

    const toolResults: any[] = [];
    const bundledCreateAdSetTool = message.tool_calls.find(
      (toolCall) => toolCall.function.name === 'create_adset'
    );
    const bundledCreateAdSetArgs = bundledCreateAdSetTool
      ? JSON.parse(bundledCreateAdSetTool.function.arguments)
      : null;
    const inferredCountriesFromCommand = inferEuCountriesFromCommand(command);

    for (const toolCall of message.tool_calls) {
      if (conversationComplete) break;
      const descriptor = getToolStepDescriptor(toolCall.function.name);
      const step = registerStepAttempt(
        stepRegistry,
        descriptor,
        `Executing ${descriptor.title.toLowerCase()}...`,
        { tool: toolCall.function.name }
      );
      console.log(`[AI-EXEC] started | tool=${toolCall.function.name} | step=${descriptor.key} | attempt=${step.attempts}`);
      await emitStep(step);

      const stepFixesApplied: string[] = [];
      try {
        let toolArgs = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'create_campaign') {
          const preflightTargeting =
            bundledCreateAdSetArgs?.targeting ||
            (inferredCountriesFromCommand.length > 0
              ? { geoLocations: { countries: inferredCountriesFromCommand } }
              : undefined);
          try {
            await mcpClient.callTool('preflight_create_campaign_bundle', {
              businessId,
              accountId: toolArgs.accountId,
              adSetTargeting: preflightTargeting,
            });
          } catch (preflightError) {
            const preflightMessage =
              preflightError instanceof Error
                ? preflightError.message
                : 'DSA preflight failed for campaign bundle.';
            actions.push({
              type: 'campaign_preflight',
              tool: 'preflight_create_campaign_bundle',
              arguments: {
                accountId: toolArgs.accountId,
                adSetTargeting: preflightTargeting,
              },
              error: preflightMessage,
              success: false,
            });
            markStepError(stepRegistry, descriptor.key, {
              summary: 'Campaign validation failed before creation.',
              userMessage: 'Account setup checks failed before campaign creation could start.',
              technicalDetails: preflightMessage,
            });
            await emitStep(stepRegistry.byKey.get(descriptor.key) || null);
            blockingError = preflightMessage;
            conversationComplete = true;
            break;
          }
        }

        if (toolCall.function.name === 'create_adset') {
          const invalidCampaignIds = [
            '',
            '__campaign_id__',
            'ACTUAL_CAMPAIGN_ID',
            'ACTUAL_CAMPAIGN_ID_FROM_STEP_1',
            'ACTUAL_CAMPAIGN_ID_FROM_create_campaign',
            'CAMPAIGN_ID',
            'CANNOT_PROCEED_YET',
            'CANNOT_PROCEED',
            'PENDING',
            null,
            undefined,
          ];
          const isPlaceholder =
            toolArgs.campaignId &&
            (toolArgs.campaignId.startsWith('__') ||
              toolArgs.campaignId.endsWith('__') ||
              toolArgs.campaignId.includes('ACTUAL_') ||
              toolArgs.campaignId.includes('CAMPAIGN_ID') ||
              toolArgs.campaignId.includes('_FROM_') ||
              toolArgs.campaignId.includes('CANNOT_') ||
              toolArgs.campaignId.includes('PENDING') ||
              toolArgs.campaignId.includes('PLACEHOLDER') ||
              !/^\d+$/.test(toolArgs.campaignId));

          if (invalidCampaignIds.includes(toolArgs.campaignId) || !toolArgs.campaignId || isPlaceholder) {
            if (campaignId) {
              toolArgs.campaignId = campaignId;
              stepFixesApplied.push('Used the campaign ID generated in the previous step.');
            } else {
              throw new Error(
                'Cannot create adset: No valid campaign ID available. Please create campaign first.'
              );
            }
          }

          const hasExplicitBudget = toolArgs.dailyBudget != null || toolArgs.lifetimeBudget != null;
          if (!hasExplicitBudget) {
            const campaignAction = actions.find((a) => a.tool === 'create_campaign' && a.success);
            const campaignDailyBudget = campaignAction?.result?.budget?.daily;
            const campaignLifetimeBudget = campaignAction?.result?.budget?.lifetime;
            if (campaignDailyBudget != null) {
              toolArgs.dailyBudget = campaignDailyBudget;
              stepFixesApplied.push('Inherited ad set daily budget from campaign settings.');
            } else if (campaignLifetimeBudget != null) {
              toolArgs.lifetimeBudget = campaignLifetimeBudget;
              stepFixesApplied.push('Inherited ad set lifetime budget from campaign settings.');
            } else {
              toolArgs.dailyBudget = 1500;
              stepFixesApplied.push('Applied a safe fallback daily budget of $15/day.');
            }
          }

          const previousAdSetBidError = actions.some(
            (action) =>
              action.tool === 'create_adset' &&
              !action.success &&
              typeof action.error === 'string' &&
              action.error.includes('Bid amount required')
          );
          const previousAdSetAdvantageAudienceError = actions.some(
            (action) =>
              action.tool === 'create_adset' &&
              !action.success &&
              typeof action.error === 'string' &&
              action.error.includes('Advantage audience flag required')
          );

          if (previousAdSetBidError) {
            const numericBidAmount =
              typeof toolArgs.bidAmount === 'number' ? toolArgs.bidAmount : Number(toolArgs.bidAmount);
            if (!Number.isFinite(numericBidAmount) || numericBidAmount <= 0) {
              const numericDailyBudget = Number(toolArgs.dailyBudget ?? 0);
              const derivedBidAmount =
                Number.isFinite(numericDailyBudget) && numericDailyBudget > 0
                  ? Math.max(100, Math.floor(numericDailyBudget * 0.2))
                  : 300;
              toolArgs.bidAmount = derivedBidAmount;
              stepFixesApplied.push('Added a fallback bid cap based on budget and retried.');
            }
          }

          if (toolArgs.targeting?.advantage_audience != null) {
            const normalizedAdvantageAudience =
              Number(toolArgs.targeting.advantage_audience) === 1 ? 1 : 0;
            toolArgs.targeting.targetingAutomation = {
              ...(toolArgs.targeting.targetingAutomation || {}),
              advantageAudience: normalizedAdvantageAudience,
            };
            delete toolArgs.targeting.advantage_audience;
            stepFixesApplied.push('Normalized Advantage Audience targeting format.');
          }

          if (previousAdSetAdvantageAudienceError && !toolArgs.targeting?.targetingAutomation) {
            toolArgs.targeting = {
              ...(toolArgs.targeting || {}),
              targetingAutomation: {
                advantageAudience: 0,
              },
            };
            stepFixesApplied.push('Disabled Advantage Audience to satisfy Meta requirement.');
          }

          const campaignAction = actions.find((a) => a.tool === 'create_campaign' && a.success);
          const campaignObjective = campaignAction?.result?.objective;
          if (campaignObjective === 'OUTCOME_LEADS') {
            if (
              !toolArgs.optimizationGoal ||
              toolArgs.optimizationGoal === 'LEADS' ||
              toolArgs.optimizationGoal === 'LEAD_GENERATION'
            ) {
              toolArgs.optimizationGoal = 'LEAD_GENERATION';
              stepFixesApplied.push('Aligned optimization goal with leads objective.');
            }
            if (!toolArgs.billingEvent) {
              toolArgs.billingEvent = 'IMPRESSIONS';
              stepFixesApplied.push('Applied default billing event for leads objective.');
            }
          }

          if (toolArgs.targeting?.locales) {
            const normalized = normalizeLocalesForMcp(toolArgs.targeting.locales);
            if (normalized.length > 0) {
              toolArgs.targeting.locales = normalized;
              stepFixesApplied.push(`Passing language targeting to Meta for resolution: [${normalized.join(', ')}].`);
            } else {
              const constraints = parseTargetingConstraints(command);
              if (constraints.language) {
                toolArgs.targeting.locales = [constraints.language];
                stepFixesApplied.push(`Restored ${constraints.language} language targeting from user command.`);
              } else {
                delete toolArgs.targeting.locales;
                stepFixesApplied.push(
                  'Removed empty locale targeting; no language was specified in the command.'
                );
              }
            }
          }

          const constraints = parseTargetingConstraints(command);
          const constraintFixes = enforceTargetingConstraints(toolArgs, constraints);
          for (const fix of constraintFixes) {
            stepFixesApplied.push(fix);
          }
          if (constraintFixes.length > 0) {
            console.log(`[AI-CONSTRAINT] tool=${toolCall.function.name} | ${constraintFixes.join('; ')}`);
          }
        }

        if (toolCall.function.name === 'create_ad') {
          const invalidAdSetIds = [
            '',
            '__adset_id__',
            'ACTUAL_ADSET_ID',
            'ACTUAL_ADSET_ID_FROM_STEP_2',
            'ADSET_ID',
            'CANNOT_PROCEED_YET',
            'CANNOT_PROCEED',
            'PENDING',
            null,
            undefined,
          ];
          const adsetAction = actions.find((a) => a.tool === 'create_adset' && a.success);
          const storedAdSetId = adsetAction?.result?.id;
          const isPlaceholder =
            toolArgs.adSetId &&
            (toolArgs.adSetId.startsWith('__') ||
              toolArgs.adSetId.endsWith('__') ||
              toolArgs.adSetId.includes('ACTUAL_') ||
              toolArgs.adSetId.includes('ADSET_ID') ||
              toolArgs.adSetId.includes('_FROM_') ||
              toolArgs.adSetId.includes('CANNOT_') ||
              toolArgs.adSetId.includes('PENDING') ||
              toolArgs.adSetId.includes('PLACEHOLDER') ||
              !/^\d+$/.test(toolArgs.adSetId));
          if (invalidAdSetIds.includes(toolArgs.adSetId) || !toolArgs.adSetId || isPlaceholder) {
            if (storedAdSetId) {
              toolArgs.adSetId = storedAdSetId;
              stepFixesApplied.push('Used the ad set ID generated in the previous step.');
            } else {
              throw new Error('Cannot create ad: No valid adset ID available. Please create adset first.');
            }
          }
        }

        if (toolCall.function.name === 'create_ad' && toolArgs.creative) {
          const creative = toolArgs.creative;
          const ngrokUrl = process.env.NGROK_URL || 'https://8ef9dec79365.ngrok-free.app';
          if (creative.linkUrl && creative.linkUrl.includes('?')) {
            const parsed = parseTrackingUrl(creative.linkUrl);
            creative.linkUrl = parsed.websiteUrl;
            if (!creative.urlParameters) {
              creative.urlParameters = parsed.urlParameters;
              stepFixesApplied.push('Extracted tracking query parameters into URL parameters field.');
            }
          }

          const adsCreatedSoFar = actions.filter((a) => a.tool === 'create_ad' && a.success).length;
          const assignedMaterial = materialAssignmentsList.find((a) => a.adIndex === adsCreatedSoFar);
          let imageFromMaterials: any = null;
          let videoFromMaterials: any = null;
          let preferVideo = false;
          if (assignedMaterial) {
            if (assignedMaterial.material.category === 'video') {
              videoFromMaterials = assignedMaterial.material;
              preferVideo = true;
            } else {
              imageFromMaterials = assignedMaterial.material;
            }
          } else {
            const materialIndex = adsCreatedSoFar % Math.max(1, commandMaterials.length);
            const materialForThisAd = commandMaterials[materialIndex];
            if (materialForThisAd) {
              if (materialForThisAd.category === 'video') {
                videoFromMaterials = materialForThisAd;
                preferVideo = true;
              } else {
                imageFromMaterials = materialForThisAd;
              }
            }
          }

          if (
            creative.imageUrl &&
            !creative.imageUrl.includes(ngrokUrl) &&
            !creative.imageUrl.includes('localhost:3000')
          ) {
            if (imageFromMaterials) {
              creative.imageUrl = imageFromMaterials.fileUrl;
              stepFixesApplied.push('Replaced invalid image URL with uploaded material URL.');
            } else {
              delete creative.imageUrl;
              stepFixesApplied.push('Removed invalid image URL from ad creative payload.');
            }
          }

          if (
            creative.videoUrl &&
            !creative.videoUrl.includes(ngrokUrl) &&
            !creative.videoUrl.includes('localhost:3000')
          ) {
            if (videoFromMaterials) {
              creative.videoUrl = videoFromMaterials.fileUrl;
              stepFixesApplied.push('Replaced invalid video URL with uploaded material URL.');
            } else {
              delete creative.videoUrl;
              stepFixesApplied.push('Removed invalid video URL from ad creative payload.');
            }
          }

          if (typeof creative.imageUrl === 'string' && creative.imageUrl.endsWith('.mp4')) {
            creative.videoUrl = creative.imageUrl;
            delete creative.imageUrl;
            stepFixesApplied.push('Moved MP4 media from image slot to video slot.');
          }

          if (!creative.imageUrl && !creative.videoUrl) {
            if (preferVideo && videoFromMaterials) {
              creative.videoUrl = videoFromMaterials.fileUrl;
              stepFixesApplied.push('Added video creative from uploaded materials.');
            } else if (imageFromMaterials) {
              creative.imageUrl = imageFromMaterials.fileUrl;
              stepFixesApplied.push('Added image creative from uploaded materials.');
            } else if (videoFromMaterials) {
              creative.videoUrl = videoFromMaterials.fileUrl;
              stepFixesApplied.push('Added video creative from uploaded materials.');
            }
          }

          if (creative.videoUrl && !creative.imageUrl) {
            const thumbnailImage =
              commandMaterials.find((m: any) => m.category === 'image') ||
              availableMaterials.find((m: any) => m.category === 'image');
            if (thumbnailImage) {
              creative.imageUrl = thumbnailImage.fileUrl;
              stepFixesApplied.push('Added thumbnail image required for video ad.');
            }
          }

          if (!creative.linkUrl) {
            const urlMatch = command.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              const parsed = parseTrackingUrl(urlMatch[0]);
              creative.linkUrl = parsed.websiteUrl;
              if (parsed.urlParameters && !creative.urlParameters) {
                creative.urlParameters = parsed.urlParameters;
              }
              stepFixesApplied.push('Extracted destination URL from command text.');
            } else {
              throw new Error(
                'Missing required linkUrl in ad creative. Please include a destination URL in your command.'
              );
            }
          }

          if (!creative.title) {
            creative.title = toolArgs.name || `Ad ${adsCreatedSoFar + 1}`;
            stepFixesApplied.push('Added fallback ad title.');
          }
          if (!creative.body) {
            creative.body = 'Check this out!';
            stepFixesApplied.push('Added fallback ad body text.');
          }
        }

        if (stepFixesApplied.length > 0) {
          const existingFixes = new Set(stepRegistry.byKey.get(descriptor.key)?.fixesApplied || []);
          const newFixes = stepFixesApplied.filter((f) => !existingFixes.has(f));
          if (newFixes.length > 0) {
            console.log(`[AI-AUTOFIX] tool=${toolCall.function.name} | ${newFixes.join('; ')}`);
          }
          const withFixes = appendStepFixes(stepRegistry, descriptor.key, stepFixesApplied);
          await emitStep(withFixes);
        }

        const result = await mcpClient.callTool(toolCall.function.name, {
          ...toolArgs,
          businessId,
        });
        toolFailureCounts[toolCall.function.name] = 0;

        if (toolCall.function.name === 'create_campaign' && result?.id) {
          campaignId = result.id;
        }

        actions.push({
          type: getActionType(toolCall.function.name),
          tool: toolCall.function.name,
          arguments: toolArgs,
          result,
          success: true,
        });

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: JSON.stringify(result),
        });

        const successSummary = buildSuccessSummary(
          toolCall.function.name,
          result,
          toolArgs,
          actions,
          requestedAdCount
        );
        const successStep = markStepSuccess(stepRegistry, descriptor.key, {
          summary: successSummary.summary,
          userTitle: successSummary.userTitle,
          userMessage: successSummary.userMessage,
          rationale: successSummary.rationale,
          technicalDetails: successSummary.technicalDetails,
          fixesApplied: stepFixesApplied,
          meta: successSummary.meta,
          createdIds: successSummary.createdIds,
        });
        console.log(`[AI-RESULT] tool=${toolCall.function.name} | ${successSummary.summary}`);
        await emitStep(successStep);
      } catch (error) {
        toolFailureCounts[toolCall.function.name] = (toolFailureCounts[toolCall.function.name] || 0) + 1;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        actions.push({
          type: getActionType(toolCall.function.name),
          tool: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
          error: errorMessage,
          success: false,
        });
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: `Error: ${errorMessage}`,
        });

        const normalizedError = normalizeExecutionError(errorMessage);
        const attemptCount = toolFailureCounts[toolCall.function.name] || 1;
        console.log(`[AI-RESULT] error | tool=${toolCall.function.name} | category=${normalizedError.category} | ${normalizedError.userTitle}`);
        const willStopForBlockingError =
          normalizedError.blocking || isBlockingConfigurationError(errorMessage);
        const reachedMaxFailures =
          toolFailureCounts[toolCall.function.name] >= MAX_CONSECUTIVE_TOOL_FAILURES;
        const shouldRetry = !willStopForBlockingError && !reachedMaxFailures;
        if (shouldRetry) {
          console.log(`[AI-RETRY] attempt=${attemptCount} | tool=${toolCall.function.name} | category=${normalizedError.category} | change=${normalizedError.rationale || 'will retry with auto-fixes'}`);
        }
        const autoFixNotes = [...stepFixesApplied];
        if (normalizedError.category === 'bid_required' && !autoFixNotes.some((n) => n.includes('bid'))) {
          autoFixNotes.push('Auto-fixed: Applied fallback bid amount and retried.');
        }
        if (normalizedError.category === 'advantage_audience' && !autoFixNotes.some((n) => n.includes('Advantage Audience'))) {
          autoFixNotes.push(
            'Auto-fixed: Set targetingAutomation.advantageAudience and retried.'
          );
        }

        if (shouldRetry) {
          const retryStep = markStepRetrying(stepRegistry, descriptor.key, {
            summary: `Attempt ${(stepRegistry.byKey.get(descriptor.key)?.attempts || 1)} failed. Retrying automatically.`,
            userTitle: normalizedError.userTitle,
            userMessage: normalizedError.userMessage,
            nextSteps: normalizedError.nextSteps,
            rationale: normalizedError.rationale,
            technicalDetails: normalizedError.debug.raw,
            fixesApplied: autoFixNotes,
            meta: {
              category: normalizedError.category,
              explanation: normalizedError.rationale,
            },
            debug: normalizedError.debug,
          });
          await emitStep(retryStep);
        } else {
          const errorStep = markStepError(stepRegistry, descriptor.key, {
            summary: `${descriptor.title} failed.`,
            userTitle: normalizedError.userTitle,
            userMessage: normalizedError.userMessage,
            nextSteps: normalizedError.nextSteps,
            rationale: normalizedError.rationale,
            technicalDetails: normalizedError.debug.raw,
            fixesApplied: autoFixNotes,
            meta: {
              category: normalizedError.category,
              explanation: normalizedError.rationale,
            },
            debug: normalizedError.debug,
          });
          await emitStep(errorStep);
        }

        if (
          toolCall.function.name === 'create_ad' &&
          isPaymentMethodRequiredError(errorMessage)
        ) {
          const createdAdSetAction = [...actions]
            .reverse()
            .find((action) => action.tool === 'create_adset' && action.success);
          const createdCampaignAction = [...actions]
            .reverse()
            .find((action) => action.tool === 'create_campaign' && action.success);

          if (createdAdSetAction?.result?.id) {
            try {
              await mcpClient.callTool('update_adset', {
                adSetId: createdAdSetAction.result.id,
                status: 'PAUSED',
                businessId,
              });
              console.log(`[AI-ROLLBACK] Paused adset ${createdAdSetAction.result.id} due to billing failure (safer than delete)`);
            } catch {
              // Ignore rollback failures.
            }
          }
          if (createdCampaignAction?.result?.id) {
            try {
              await mcpClient.callTool('update_campaign', {
                campaignId: createdCampaignAction.result.id,
                status: 'PAUSED',
                businessId,
              });
              console.log(`[AI-ROLLBACK] Paused campaign ${createdCampaignAction.result.id} due to billing failure (safer than delete)`);
            } catch {
              // Ignore rollback failures.
            }
          }
        }

        if (willStopForBlockingError) {
          blockingError = errorMessage;
          conversationComplete = true;
          break;
        }
        if (reachedMaxFailures) {
          conversationComplete = true;
        }
      }
    }

    messages.push(...toolResults);
    if (conversationComplete) continue;

    const campaignCreated = actions.some((a) => a.tool === 'create_campaign' && a.success);
    const adsetCreated = actions.some((a) => a.tool === 'create_adset' && a.success);
    const adsCreated = actions.filter((a) => a.tool === 'create_ad' && a.success).length;
    const campaignDuplicated = actions.some((a) => a.tool === 'duplicate_campaign' && a.success);
    const adsetDuplicated = actions.some((a) => a.tool === 'duplicate_adset' && a.success);
    const adDuplicated = actions.some((a) => a.tool === 'duplicate_ad' && a.success);
    const campaignsFetched = actions.some((a) => a.tool === 'get_campaigns' && a.success);
    const campaignsUpdated = actions.filter((a) => a.tool === 'update_campaign' && a.success).length;
    const adsetAction = actions.find((a) => a.tool === 'create_adset' && a.success);
    const adsetId = adsetAction?.result?.id;

    if (campaignDuplicated || adsetDuplicated || adDuplicated) {
      conversationComplete = true;
    } else if (isManagementCommand) {
      if (campaignCreated && !adsetCreated) {
        messages.push({
          role: 'user',
          content: `Great! Duplicate campaign was created with ID: ${campaignId}. Now create an adset for this campaign with the new targeting parameters (as specified in the command).`,
        });
      } else if (campaignCreated && adsetCreated && adsCreated === 0 && adsetId) {
        messages.push({
          role: 'user',
          content: `Excellent! Campaign and adset created. Now create an ad for adset ${adsetId} to complete the duplication.`,
        });
      } else if (campaignCreated && adsetCreated && adsCreated > 0) {
        conversationComplete = true;
      } else if (campaignsFetched && campaignsUpdated > 0) {
        // Let AI decide next updates.
      }
    } else {
      if (campaignCreated && !adsetCreated) {
        messages.push({
          role: 'user',
          content: `Great! Campaign was created with ID: ${campaignId}. Now create an adset for this campaign using the targeting parameters from the original command.`,
        });
      } else if (campaignCreated && adsetCreated && adsCreated < requestedAdCount && adsetId) {
        const nextAdNumber = adsCreated + 1;
        const assignedMaterial = materialAssignmentsList.find((a) => a.adIndex === adsCreated);
        let materialInstruction = '';
        if (assignedMaterial) {
          const materialType = assignedMaterial.material.category === 'video' ? 'videoUrl' : 'imageUrl';
          materialInstruction = ` Use ${assignedMaterial.filename} (${materialType}: ${assignedMaterial.material.fileUrl}) for this ad's creative.`;
        } else if (commandMaterials[adsCreated]) {
          const mat = commandMaterials[adsCreated];
          const materialType = mat.category === 'video' ? 'videoUrl' : 'imageUrl';
          materialInstruction = ` Use ${mat.originalName} (${materialType}: ${mat.fileUrl}) for this ad's creative.`;
        }
        messages.push({
          role: 'user',
          content: `${adsCreated === 0 ? 'Excellent! Campaign and adset were created successfully.' : `Good! Ad ${adsCreated} created.`} AdSet ID: ${adsetId}. Now create ad ${nextAdNumber} of ${requestedAdCount} for this adset.${materialInstruction} Use a unique ad name like "Ad ${nextAdNumber}" to distinguish it.`,
        });
      } else if (campaignCreated && adsetCreated && adsCreated >= requestedAdCount) {
        conversationComplete = true;
      } else if (actions.length > 0 && !campaignCreated && !isManagementCommand) {
        conversationComplete = true;
      }
    }
  }

  const lastMessage = messages[messages.length - 1];
  const reasoning =
    typeof lastMessage?.content === 'string' ? lastMessage.content : 'Processing completed';

  const campaignsUpdated = actions.filter((a) => a.tool === 'update_campaign' && a.success).length;
  const campaignsCreated = actions.filter((a) => a.tool === 'create_campaign' && a.success).length;
  const adsetsCreated = actions.filter((a) => a.tool === 'create_adset' && a.success).length;
  const adsCreatedCount = actions.filter((a) => a.tool === 'create_ad' && a.success).length;
  const campaignsDuplicated = actions.filter((a) => a.tool === 'duplicate_campaign' && a.success).length;
  const adsetsDuplicated = actions.filter((a) => a.tool === 'duplicate_adset' && a.success).length;
  const adsDuplicated = actions.filter((a) => a.tool === 'duplicate_ad' && a.success).length;

  let summaryMessage = `Executed ${actions.length} actions for: ${command}`;
  if (campaignsDuplicated > 0) {
    summaryMessage = `Duplicated ${campaignsDuplicated} campaign(s) with all ad sets and ads`;
  } else if (adsetsDuplicated > 0) {
    summaryMessage = `Duplicated ${adsetsDuplicated} ad set(s) with all ads`;
  } else if (adsDuplicated > 0) {
    summaryMessage = `Duplicated ${adsDuplicated} ad(s)`;
  } else if (campaignsUpdated > 0) {
    summaryMessage = `Updated ${campaignsUpdated} campaign(s): ${command}`;
  } else if (campaignsCreated > 0) {
    summaryMessage = `Campaign + Ad Set + ${adsCreatedCount} Ad${adsCreatedCount === 1 ? '' : 's'} created successfully.`;
  }

  const steps = listExecutionSteps(stepRegistry);
  const createdIds = extractCreatedIds(actions);
  if (blockingError) {
    const normalizedBlockingError = normalizeBlockingError(blockingError);
    const normalizedRequestAdAccountId = normalizeAdAccountId(accountId);
    const action =
      normalizedBlockingError.code === 'DSA_REQUIRED'
        ? {
            type: 'OPEN_DSA_SETTINGS' as const,
            tenantId,
            adAccountId: normalizedRequestAdAccountId,
          }
        : normalizedBlockingError.code === 'DEFAULT_PAGE_REQUIRED'
          ? {
              type: 'OPEN_DEFAULT_PAGE_SETTINGS' as const,
              tenantId,
              adAccountId: normalizedRequestAdAccountId,
            }
          : undefined;
    const blockingPayload: ExecutionBlockingError = {
      ...normalizedBlockingError,
      message: normalizedBlockingError.userMessage,
      action,
    };
    const summary = buildExecutionSummary(
      steps,
      false,
      normalizedBlockingError.userMessage,
      createdIds
    );
    return {
      success: false,
      steps,
      summary,
      reasoning,
      message: normalizedBlockingError.userMessage,
      createdIds,
      blockingError: blockingPayload,
    };
  }

  const summary = buildExecutionSummary(steps, true, summaryMessage, createdIds);
  return {
    success: summary.finalStatus === 'success',
    steps,
    summary,
    reasoning,
    message: summaryMessage,
    createdIds,
  };
}

function cloneStep(step: ExecutionStep): ExecutionStep {
  return JSON.parse(JSON.stringify(step)) as ExecutionStep;
}

function buildMaterialsInfo(commandMaterials: any[], availableMaterials: any[]): string {
  if (commandMaterials.length > 0) {
    return `\n\n📎 MATERIALS AVAILABLE FOR USE (Auto-Select Mode):\n${commandMaterials
      .map(
        (m: any) =>
          `- ${m.originalName} (${m.category.toUpperCase()}) → URL: ${m.fileUrl}`
      )
      .join('\n')}`;
  }
  if (availableMaterials.length > 0) {
    return `\n\n📎 AVAILABLE MATERIALS:\n${availableMaterials
      .map(
        (m: any) =>
          `- ${m.originalName} (${m.category.toUpperCase()}) → URL: ${m.fileUrl}`
      )
      .join('\n')}`;
  }
  return '\n\n📎 No materials available. Create ads without images/videos or ask user to upload materials first.';
}

function buildMaterialAssignmentsList(command: string, commandMaterials: any[], requestedAdCount: number) {
  const materialAssignmentsList: { adIndex: number; filename: string; material: any }[] = [];
  if (commandMaterials.length === 0 || requestedAdCount <= 0) {
    return materialAssignmentsList;
  }

  const commandLower = command.toLowerCase();
  const positionPatterns = [
    { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:first|1st|ad\s*1)/gi, adIndex: 0 },
    { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:first|1st|ad\s*1)/gi, adIndex: 0 },
    { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:second|2nd|ad\s*2)/gi, adIndex: 1 },
    { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:second|2nd|ad\s*2)/gi, adIndex: 1 },
    { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:third|3rd|ad\s*3)/gi, adIndex: 2 },
    { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:third|3rd|ad\s*3)/gi, adIndex: 2 },
  ];
  const assignedIndices = new Set<number>();
  const assignedMaterials = new Set<string>();

  for (const { pattern, adIndex } of positionPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(commandLower)) !== null) {
      const mentionedFilename = match[1].toLowerCase();
      if (assignedIndices.has(adIndex)) continue;
      const matchedMaterial = commandMaterials.find((m) => {
        const matFilename = m.originalName.toLowerCase();
        const matNameNoExt = matFilename.replace(/\.[^.]+$/, '');
        return (
          matFilename === mentionedFilename ||
          matNameNoExt === mentionedFilename.replace(/\.[^.]+$/, '') ||
          matFilename.includes(mentionedFilename.replace(/\.[^.]+$/, ''))
        );
      });
      if (matchedMaterial && !assignedMaterials.has(matchedMaterial.id)) {
        materialAssignmentsList.push({
          adIndex,
          filename: matchedMaterial.originalName,
          material: matchedMaterial,
        });
        assignedIndices.add(adIndex);
        assignedMaterials.add(matchedMaterial.id);
      }
    }
  }

  if (materialAssignmentsList.length < requestedAdCount) {
    for (let i = 0; i < requestedAdCount; i += 1) {
      if (assignedIndices.has(i)) continue;
      const availableMaterial = commandMaterials.find((m) => !assignedMaterials.has(m.id));
      if (availableMaterial) {
        materialAssignmentsList.push({
          adIndex: i,
          filename: availableMaterial.originalName,
          material: availableMaterial,
        });
        assignedIndices.add(i);
        assignedMaterials.add(availableMaterial.id);
      }
    }
  }

  materialAssignmentsList.sort((a, b) => a.adIndex - b.adIndex);
  return materialAssignmentsList;
}

function buildSuccessSummary(
  toolName: string,
  result: any,
  toolArgs: Record<string, any>,
  actions: RawAction[],
  requestedAdCount: number
): {
  summary: string;
  userTitle?: string;
  userMessage?: string;
  rationale?: string;
  technicalDetails?: string;
  createdIds?: CreatedEntityIds;
  meta?: Record<string, any>;
} {
  if (toolName === 'create_campaign') {
    const campaignName = result?.name || toolArgs.name || 'Campaign';
    const dailyBudget = result?.budget?.daily ?? toolArgs.dailyBudget;
    return {
      summary: `Campaign "${campaignName}" created with ${formatBudget(dailyBudget)} budget.`,
      userTitle: 'Campaign created',
      userMessage: 'Campaign setup completed successfully.',
      rationale:
        'The command requested a new campaign, so we created the campaign first to provide a valid parent entity for downstream ad sets.',
      technicalDetails: result?.id ? `Campaign ID: ${result.id}` : undefined,
      createdIds: result?.id ? { campaignId: String(result.id) } : undefined,
      meta: {
        objective: result?.objective || toolArgs.objective,
        status: result?.status || toolArgs.status,
        id: result?.id,
      },
    };
  }
  if (toolName === 'create_adset') {
    return {
      summary: 'Ad set created successfully with validated targeting and budget settings.',
      userTitle: 'Ad set created',
      userMessage: 'Ad set setup completed successfully.',
      rationale:
        'After campaign creation, we configured targeting, budget, and delivery optimization at ad set level.',
      technicalDetails: result?.id ? `Ad Set ID: ${result.id}` : undefined,
      createdIds: result?.id ? { adSetId: String(result.id) } : undefined,
      meta: {
        id: result?.id,
        optimizationGoal: toolArgs.optimizationGoal,
        billingEvent: toolArgs.billingEvent,
      },
    };
  }
  if (toolName === 'create_ad') {
    const adsCreatedCount = actions.filter((a) => a.tool === 'create_ad' && a.success).length;
    return {
      summary: `${adsCreatedCount} of ${requestedAdCount} ad${requestedAdCount === 1 ? '' : 's'} created successfully.`,
      userTitle: 'Ad created',
      userMessage:
        adsCreatedCount >= requestedAdCount
          ? 'All requested ads were created successfully.'
          : 'Ad created successfully. Continuing with remaining ads.',
      rationale:
        adsCreatedCount >= requestedAdCount
          ? 'All requested creatives are now attached to the new ad set.'
          : 'This ad was created and we are continuing to fulfill the requested ad count.',
      technicalDetails: result?.id ? `Latest Ad ID: ${result.id}` : undefined,
      createdIds: result?.id ? { adId: String(result.id) } : undefined,
      meta: {
        adsCreated: adsCreatedCount,
        requestedAds: requestedAdCount,
        title: toolArgs.creative?.title,
        body: toolArgs.creative?.body,
        url: toolArgs.creative?.linkUrl,
      },
    };
  }
  return {
    summary: `${toolName} completed successfully.`,
    rationale: 'The requested operation completed successfully.',
  };
}

function buildExecutionSummary(
  steps: ExecutionStep[],
  success: boolean,
  finalMessage: string,
  createdIds?: CreatedEntityIds
): ExecutionSummary {
  const primarySteps = steps.filter(
    (step) => step.type === 'campaign' || step.type === 'adset' || step.type === 'ad'
  );
  const totalSteps = primarySteps.length > 0 ? 3 : Math.max(1, steps.length);
  const stepsCompleted = primarySteps.filter((step) => step.status === 'success').length;
  const retries = steps.reduce((sum, step) => sum + Math.max(0, (step.attempts || 1) - 1), 0);
  const hasErrors = steps.some((step) => step.status === 'error');
  const finalStatus = success
    ? hasErrors
      ? 'partial'
      : 'success'
    : stepsCompleted > 0
      ? 'partial'
      : 'error';

  return {
    stepsCompleted,
    totalSteps,
    retries,
    finalStatus,
    finalMessage,
    createdIds,
  };
}

function formatBudget(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'an assigned';
  const dollars = numeric / 100;
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}/day`;
}

function extractCreatedIds(actions: RawAction[]): CreatedEntityIds | undefined {
  const createdCampaign = actions.find((action) => action.tool === 'create_campaign' && action.success);
  const createdAdSet = actions.find((action) => action.tool === 'create_adset' && action.success);
  const createdAd = [...actions]
    .reverse()
    .find((action) => action.tool === 'create_ad' && action.success);
  const adSetIds = actions
    .filter((action) => action.tool === 'create_adset' && action.success && action.result?.id)
    .map((action) => String(action.result.id));
  const adIds = actions
    .filter((action) => action.tool === 'create_ad' && action.success && action.result?.id)
    .map((action) => String(action.result.id));

  const payload: CreatedEntityIds = {
    campaignId: createdCampaign?.result?.id ? String(createdCampaign.result.id) : undefined,
    adSetId: createdAdSet?.result?.id ? String(createdAdSet.result.id) : undefined,
    adId: createdAd?.result?.id ? String(createdAd.result.id) : undefined,
    adSetIds: adSetIds.length > 0 ? adSetIds : undefined,
    adIds: adIds.length > 0 ? adIds : undefined,
  };

  if (!payload.campaignId && !payload.adSetId && !payload.adId && !payload.adSetIds && !payload.adIds) {
    return undefined;
  }
  return payload;
}

function getActionType(toolName: string): string {
  switch (toolName) {
    case 'create_campaign':
      return 'campaign_create';
    case 'update_campaign':
      return 'campaign_update';
    case 'get_campaigns':
      return 'campaign_fetch';
    case 'duplicate_campaign':
      return 'campaign_duplicate';
    case 'create_adset':
      return 'adset_create';
    case 'update_adset':
      return 'adset_update';
    case 'get_adsets':
      return 'adset_fetch';
    case 'duplicate_adset':
      return 'adset_duplicate';
    case 'create_ad':
      return 'ad_create';
    case 'update_ad':
      return 'ad_update';
    case 'get_ads':
      return 'ad_fetch';
    case 'duplicate_ad':
      return 'ad_duplicate';
    default:
      return 'unknown';
  }
}

function inferEuCountriesFromCommand(command: string): string[] {
  const normalized = command.toLowerCase();
  const countryMap: Record<string, string> = {
    romania: 'RO',
    poland: 'PL',
    germany: 'DE',
    france: 'FR',
    italy: 'IT',
    spain: 'ES',
    netherlands: 'NL',
    belgium: 'BE',
    austria: 'AT',
    sweden: 'SE',
    denmark: 'DK',
    finland: 'FI',
    czechia: 'CZ',
    'czech republic': 'CZ',
    hungary: 'HU',
    portugal: 'PT',
    greece: 'GR',
    ireland: 'IE',
    slovakia: 'SK',
    slovenia: 'SI',
    croatia: 'HR',
    bulgaria: 'BG',
    lithuania: 'LT',
    latvia: 'LV',
    estonia: 'EE',
    luxembourg: 'LU',
    cyprus: 'CY',
    malta: 'MT',
    norway: 'NO',
  };
  const countries = new Set<string>();
  for (const [keyword, code] of Object.entries(countryMap)) {
    if (normalized.includes(keyword)) {
      countries.add(code);
    }
  }
  return Array.from(countries);
}

/**
 * Normalize locale values into strings for MCP server resolution.
 * Numbers are passed through (MCP accepts them); string language names
 * are passed as-is so the MCP server resolves them via Graph API search.
 * This avoids hardcoded locale ID mappings that can be wrong.
 */
function normalizeLocalesForMcp(rawLocales: unknown[]): Array<string | number> {
  const result: Array<string | number> = [];
  const seen = new Set<string>();

  for (const locale of rawLocales) {
    if (typeof locale === 'number' && Number.isFinite(locale)) {
      const key = String(locale);
      if (!seen.has(key)) { seen.add(key); result.push(locale); }
      continue;
    }
    if (typeof locale === 'string') {
      const trimmed = locale.trim();
      if (!trimmed) continue;
      const asNum = Number.parseInt(trimmed, 10);
      if (Number.isFinite(asNum) && asNum.toString() === trimmed) {
        const key = trimmed;
        if (!seen.has(key)) { seen.add(key); result.push(asNum); }
      } else {
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) { seen.add(key); result.push(trimmed.toLowerCase()); }
      }
    }
  }

  return result;
}

function isManagementStyleCommand(command: string): boolean {
  const commandLower = command.toLowerCase();
  return (
    commandLower.includes('pause') ||
    commandLower.includes('activate') ||
    commandLower.includes('resume') ||
    commandLower.includes('duplicate') ||
    commandLower.includes('update') ||
    commandLower.includes('change status') ||
    commandLower.includes('change budget') ||
    commandLower.includes('set budget') ||
    commandLower.includes('budget to') ||
    (commandLower.includes('ctr') &&
      (commandLower.includes('below') || commandLower.includes('under')))
  );
}

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function normalizeBlockingError(errorMessage: string): {
  code: 'DSA_REQUIRED' | 'DEFAULT_PAGE_REQUIRED' | 'PAYMENT_METHOD_REQUIRED';
  category: string;
  blocking: boolean;
  userTitle: string;
  userMessage: string;
  message: string;
  nextSteps: string[];
  debug: Record<string, unknown>;
} {
  if (
    errorMessage.includes('Select a default Page for this ad account') ||
    errorMessage.includes('Cannot create lead ad set: no promotable page found') ||
    errorMessage.includes('Cannot create leads campaign bundle: no promotable page found')
  ) {
    return {
      code: 'DEFAULT_PAGE_REQUIRED',
      category: 'default_page',
      blocking: true,
      userTitle: 'Default Facebook Page required',
      userMessage:
        'Lead/link ads require a default Facebook Page connected to this ad account.',
      message: errorMessage,
      nextSteps: [
        'Open Tenant Ad Account Settings.',
        'Select a default Facebook Page for this ad account.',
        'Retry the campaign creation request after saving.',
      ],
      debug: { raw: errorMessage },
    };
  }

  try {
    const parsed = JSON.parse(errorMessage) as {
      code?: string;
      message?: string;
      nextSteps?: string[];
    };
    if (parsed && parsed.code === 'DEFAULT_PAGE_REQUIRED' && parsed.message) {
      const normalized = normalizeExecutionError(parsed.message);
      return {
        code: 'DEFAULT_PAGE_REQUIRED',
        category: normalized.category,
        blocking: normalized.blocking,
        userTitle: normalized.userTitle,
        userMessage: normalized.userMessage,
        message: parsed.message,
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        debug: normalized.debug,
      };
    }
    if (parsed && parsed.code === 'PAYMENT_METHOD_REQUIRED' && parsed.message) {
      const normalized = normalizeExecutionError(parsed.message);
      return {
        code: 'PAYMENT_METHOD_REQUIRED',
        category: normalized.category,
        blocking: normalized.blocking,
        userTitle: normalized.userTitle,
        userMessage: normalized.userMessage,
        message: parsed.message,
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        debug: normalized.debug,
      };
    }
    if (parsed && parsed.code === 'DSA_REQUIRED' && parsed.message) {
      const normalized = normalizeExecutionError(parsed.message);
      return {
        code: 'DSA_REQUIRED',
        category: normalized.category,
        blocking: normalized.blocking,
        userTitle: normalized.userTitle,
        userMessage: normalized.userMessage,
        message: parsed.message,
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        debug: normalized.debug,
      };
    }
  } catch {
    // Fall through.
  }

  if (isPaymentMethodRequiredError(errorMessage)) {
    const normalized = normalizeExecutionError(errorMessage);
    return {
      code: 'PAYMENT_METHOD_REQUIRED',
      category: normalized.category,
      blocking: normalized.blocking,
      userTitle: normalized.userTitle,
      userMessage: normalized.userMessage,
      message:
        errorMessage ||
        'Add a valid payment method for this ad account before creating campaigns and ads.',
      nextSteps: [
        'Open Meta Ads Manager > Billing & payments for this ad account.',
        'Add or confirm a valid payment method.',
        'Retry the campaign creation request.',
      ],
      debug: normalized.debug,
    };
  }

  const normalized = normalizeExecutionError(errorMessage);
  return {
    code: 'DSA_REQUIRED',
    category: normalized.category,
    blocking: normalized.blocking,
    userTitle: normalized.userTitle,
    userMessage: normalized.userMessage,
    message:
      errorMessage ||
      'DSA requirements are missing for EU targeting. Set DSA payor/beneficiary in tenant settings.',
    nextSteps: [
      'Open Tenant Settings > DSA.',
      'Autofill from Meta recommendations or set values manually.',
      'Retry the campaign creation request.',
    ],
    debug: normalized.debug,
  };
}

function isPaymentMethodRequiredError(errorMessage: string): boolean {
  return (
    errorMessage.includes('PAYMENT_METHOD_REQUIRED') ||
    errorMessage.includes('No payment method') ||
    errorMessage.includes('Update payment method') ||
    errorMessage.includes('billing and payment centre') ||
    errorMessage.includes('subcode=1359188')
  );
}

function isBlockingConfigurationError(errorMessage: string): boolean {
  return (
    errorMessage.includes('DSA_REQUIRED') ||
    errorMessage.includes('Set DSA payor/beneficiary') ||
    errorMessage.includes('Select a default Page for this ad account') ||
    isPaymentMethodRequiredError(errorMessage)
  );
}
