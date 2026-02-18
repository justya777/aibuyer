import type { PolicyConfig } from '../../config/env.js';
import { PolicyViolationError, type PolicyEvaluation } from './types.js';

interface MutationBudget {
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
}

interface PolicyInput {
  tenantId: string;
  operation: string;
  currentBudget?: MutationBudget;
  nextBudget?: MutationBudget;
  requireExplicitBudget?: boolean;
  nextStatus?: string;
  targeting?: {
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    customAudiences?: string[];
  };
  deepCopy?: boolean;
}

const HOUR_IN_MS = 60 * 60 * 1000;

export class PolicyEngine {
  private readonly policy: PolicyConfig;
  private readonly mutationTimestampsByTenant = new Map<string, number[]>();
  private readonly nowFn: () => number;

  constructor(policy: PolicyConfig, nowFn: () => number = () => Date.now()) {
    this.policy = policy;
    this.nowFn = nowFn;
  }

  evaluateMutation(input: PolicyInput): PolicyEvaluation {
    this.enforceMutationVolume(input.tenantId);
    this.enforceExplicitBudget(input);
    this.enforceBudgetIncreaseCap(input);

    const warnings: string[] = [];

    if (this.isEnableOperation(input.nextStatus)) {
      warnings.push('Enabling campaigns/ad sets/ads should require explicit approval.');
    }

    if (this.isBudgetIncrease(input.currentBudget, input.nextBudget)) {
      warnings.push('Budget increase detected and should require explicit approval.');
    }

    if (this.isBroadTargeting(input.targeting)) {
      warnings.push('Broad targeting detected and should require explicit approval.');
    }

    if (input.operation.startsWith('duplicate_') && input.deepCopy) {
      warnings.push('Bulk duplication (deep copy) should require explicit approval.');
    }

    if (this.policy.enforcementMode === 'block' && warnings.length > 0) {
      throw new PolicyViolationError(
        `Policy blocked operation ${input.operation}: ${warnings.join(' ')}`
      );
    }

    return { warnings };
  }

  private enforceMutationVolume(tenantId: string): void {
    const now = this.nowFn();
    const windowStart = now - HOUR_IN_MS;
    const timestamps = this.mutationTimestampsByTenant.get(tenantId) || [];
    const filtered = timestamps.filter((ts) => ts >= windowStart);

    if (filtered.length >= this.policy.maxMutationsPerTenantPerHour) {
      throw new PolicyViolationError(
        `Tenant ${tenantId} exceeded mutation limit of ${this.policy.maxMutationsPerTenantPerHour} per hour`
      );
    }

    filtered.push(now);
    this.mutationTimestampsByTenant.set(tenantId, filtered);
  }

  private enforceExplicitBudget(input: PolicyInput): void {
    if (!input.requireExplicitBudget) return;
    const hasDaily = input.nextBudget?.dailyBudget != null;
    const hasLifetime = input.nextBudget?.lifetimeBudget != null;
    if (!hasDaily && !hasLifetime) {
      throw new PolicyViolationError(
        `Operation ${input.operation} requires explicit dailyBudget or lifetimeBudget`
      );
    }
  }

  private enforceBudgetIncreaseCap(input: PolicyInput): void {
    const daily = this.getIncreasePercent(
      input.currentBudget?.dailyBudget,
      input.nextBudget?.dailyBudget
    );
    const lifetime = this.getIncreasePercent(
      input.currentBudget?.lifetimeBudget,
      input.nextBudget?.lifetimeBudget
    );
    const maxIncrease = Math.max(daily, lifetime);

    if (maxIncrease > this.policy.maxBudgetIncreasePercent) {
      throw new PolicyViolationError(
        `Budget increase ${maxIncrease.toFixed(
          2
        )}% exceeds max allowed ${this.policy.maxBudgetIncreasePercent}%`
      );
    }
  }

  private getIncreasePercent(
    currentValue: number | null | undefined,
    nextValue: number | null | undefined
  ): number {
    if (currentValue == null || nextValue == null) return 0;
    if (currentValue <= 0) return 0;
    if (nextValue <= currentValue) return 0;
    return ((nextValue - currentValue) / currentValue) * 100;
  }

  private isEnableOperation(nextStatus?: string): boolean {
    return (nextStatus || '').toUpperCase() === 'ACTIVE';
  }

  private isBudgetIncrease(
    currentBudget?: MutationBudget,
    nextBudget?: MutationBudget
  ): boolean {
    const dailyIncrease =
      currentBudget?.dailyBudget != null &&
      nextBudget?.dailyBudget != null &&
      nextBudget.dailyBudget > currentBudget.dailyBudget;
    const lifetimeIncrease =
      currentBudget?.lifetimeBudget != null &&
      nextBudget?.lifetimeBudget != null &&
      nextBudget.lifetimeBudget > currentBudget.lifetimeBudget;

    return Boolean(dailyIncrease || lifetimeIncrease);
  }

  private isBroadTargeting(targeting?: {
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    customAudiences?: string[];
  }): boolean {
    if (!targeting) return false;

    const ageMin = targeting.ageMin ?? 18;
    const ageMax = targeting.ageMax ?? 65;
    const ageSpan = ageMax - ageMin;
    const hasNarrowingAudiences =
      (targeting.interests && targeting.interests.length > 0) ||
      (targeting.customAudiences && targeting.customAudiences.length > 0);

    return ageSpan >= this.policy.broadTargetingAgeSpanThreshold && !hasNarrowingAudiences;
  }
}
