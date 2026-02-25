import type { ExecutionStep, ExecutionStepType } from '../../../shared/types';

export interface StepRegistry {
  byKey: Map<string, ExecutionStep>;
  orderedKeys: string[];
}

type StepDescriptor = {
  key: string;
  type: ExecutionStepType;
  title: string;
  order: number;
};

type StepMutationInput = {
  summary: string;
  userTitle?: string;
  userMessage?: string;
  nextSteps?: string[];
  rationale?: string;
  technicalDetails?: string;
  fixesApplied?: string[];
  meta?: Record<string, any>;
  debug?: Record<string, any>;
  createdIds?: Record<string, any>;
};

const DEFAULT_STEP_ORDERS: Record<ExecutionStepType, number> = {
  campaign: 1,
  adset: 2,
  ad: 3,
  validation: 4,
  error: 5,
};

export function createStepRegistry(): StepRegistry {
  return {
    byKey: new Map<string, ExecutionStep>(),
    orderedKeys: [],
  };
}

export function getToolStepDescriptor(toolName: string): StepDescriptor {
  switch (toolName) {
    case 'create_campaign':
      return { key: 'campaign', type: 'campaign', title: 'Campaign Creation', order: 1 };
    case 'create_adset':
      return { key: 'adset', type: 'adset', title: 'Ad Set Creation', order: 2 };
    case 'create_ad':
      return { key: 'ad', type: 'ad', title: 'Ad Creation', order: 3 };
    case 'preflight_create_campaign_bundle':
      return {
        key: 'campaign_preflight',
        type: 'validation',
        title: 'Campaign Validation',
        order: 0,
      };
    default:
      return {
        key: `tool:${toolName}`,
        type: 'validation',
        title: humanizeToolName(toolName),
        order: DEFAULT_STEP_ORDERS.validation,
      };
  }
}

export function registerStepAttempt(
  registry: StepRegistry,
  descriptor: StepDescriptor,
  summary: string,
  meta?: Record<string, any>
): ExecutionStep {
  const existing = registry.byKey.get(descriptor.key);
  if (!existing) {
    const created: ExecutionStep = {
      id: `${descriptor.key}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      order: descriptor.order,
      title: descriptor.title,
      type: descriptor.type,
      status: 'running',
      summary,
      startedAt: new Date().toISOString(),
      attempts: 1,
      meta,
    };
    registry.byKey.set(descriptor.key, created);
    registry.orderedKeys.push(descriptor.key);
    return created;
  }

  existing.status = 'running';
  existing.summary = summary;
  existing.attempts = (existing.attempts || 0) + 1;
  existing.finishedAt = undefined;
  if (meta) {
    existing.meta = {
      ...(existing.meta || {}),
      ...meta,
    };
  }
  return existing;
}

export function appendStepFixes(registry: StepRegistry, stepKey: string, fixesApplied: string[]): ExecutionStep | null {
  if (fixesApplied.length === 0) {
    return registry.byKey.get(stepKey) || null;
  }
  const step = registry.byKey.get(stepKey);
  if (!step) return null;
  step.fixesApplied = uniqueText([...(step.fixesApplied || []), ...fixesApplied]);
  return step;
}

export function markStepRetrying(
  registry: StepRegistry,
  stepKey: string,
  input: StepMutationInput
): ExecutionStep | null {
  const step = registry.byKey.get(stepKey);
  if (!step) return null;
  step.status = 'retrying';
  step.summary = input.summary;
  step.userTitle = input.userTitle;
  step.userMessage = input.userMessage;
  step.nextSteps = input.nextSteps;
  step.rationale = input.rationale;
  step.technicalDetails = input.technicalDetails;
  step.debug = input.debug;
  step.createdIds = input.createdIds;
  if (input.fixesApplied && input.fixesApplied.length > 0) {
    step.fixesApplied = uniqueText([...(step.fixesApplied || []), ...input.fixesApplied]);
  }
  if (input.meta) {
    step.meta = {
      ...(step.meta || {}),
      ...input.meta,
    };
  }
  return step;
}

export function markStepSuccess(
  registry: StepRegistry,
  stepKey: string,
  input: StepMutationInput
): ExecutionStep | null {
  const step = registry.byKey.get(stepKey);
  if (!step) return null;
  step.status = 'success';
  step.summary = input.summary;
  step.userTitle = input.userTitle;
  step.userMessage = input.userMessage;
  step.nextSteps = input.nextSteps;
  step.rationale = input.rationale;
  step.technicalDetails = input.technicalDetails;
  step.debug = input.debug;
  step.createdIds = input.createdIds;
  if (input.fixesApplied && input.fixesApplied.length > 0) {
    step.fixesApplied = uniqueText([...(step.fixesApplied || []), ...input.fixesApplied]);
  }
  if (input.meta) {
    step.meta = {
      ...(step.meta || {}),
      ...input.meta,
    };
  }
  step.finishedAt = new Date().toISOString();
  return step;
}

export function markStepError(
  registry: StepRegistry,
  stepKey: string,
  input: StepMutationInput
): ExecutionStep | null {
  const step = registry.byKey.get(stepKey);
  if (!step) return null;
  step.status = 'error';
  step.summary = input.summary;
  step.userTitle = input.userTitle;
  step.userMessage = input.userMessage;
  step.nextSteps = input.nextSteps;
  step.rationale = input.rationale;
  step.technicalDetails = input.technicalDetails;
  step.debug = input.debug;
  step.createdIds = input.createdIds;
  if (input.fixesApplied && input.fixesApplied.length > 0) {
    step.fixesApplied = uniqueText([...(step.fixesApplied || []), ...input.fixesApplied]);
  }
  if (input.meta) {
    step.meta = {
      ...(step.meta || {}),
      ...input.meta,
    };
  }
  step.finishedAt = new Date().toISOString();
  return step;
}

export function listExecutionSteps(registry: StepRegistry): ExecutionStep[] {
  return registry.orderedKeys
    .map((key) => registry.byKey.get(key))
    .filter((step): step is ExecutionStep => Boolean(step))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.startedAt.localeCompare(b.startedAt);
    });
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function humanizeToolName(toolName: string): string {
  return toolName
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
