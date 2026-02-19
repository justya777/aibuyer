import { PolicyEngine } from '../fb/core/policy-engine.js';
import { PolicyViolationError } from '../fb/core/types.js';

describe('PolicyEngine', () => {
  const baseConfig = {
    enforcementMode: 'allow_with_warning' as const,
    maxBudgetIncreasePercent: 50,
    maxMutationsPerTenantPerHour: 2,
    broadTargetingAgeSpanThreshold: 30,
  };

  it('requires explicit budget when configured', () => {
    const engine = new PolicyEngine(baseConfig);

    expect(() =>
      engine.evaluateMutation({
        tenantId: 'tenantA',
        operation: 'create_campaign',
        requireExplicitBudget: true,
      })
    ).toThrow(PolicyViolationError);
  });

  it('returns warnings for risky operations in allow-with-warning mode', () => {
    const engine = new PolicyEngine({
      ...baseConfig,
      maxMutationsPerTenantPerHour: 10,
    });

    const result = engine.evaluateMutation({
      tenantId: 'tenantA',
      operation: 'duplicate_campaign',
      deepCopy: true,
      nextStatus: 'ACTIVE',
      targeting: {
        ageMin: 18,
        ageMax: 65,
        interests: [],
      },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.requiresApproval).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/approval/i);
  });

  it('enforces budget increase cap', () => {
    const engine = new PolicyEngine({
      ...baseConfig,
      maxMutationsPerTenantPerHour: 10,
      maxBudgetIncreasePercent: 25,
    });

    expect(() =>
      engine.evaluateMutation({
        tenantId: 'tenantA',
        operation: 'update_campaign',
        currentBudget: { dailyBudget: 100 },
        nextBudget: { dailyBudget: 200 },
      })
    ).toThrow(/exceeds max allowed/);
  });

  it('enforces mutation volume per tenant per hour', () => {
    let now = 0;
    const engine = new PolicyEngine(baseConfig, () => now);

    engine.evaluateMutation({
      tenantId: 'tenantA',
      operation: 'create_campaign',
      requireExplicitBudget: true,
      nextBudget: { dailyBudget: 100 },
    });
    now += 1000;
    engine.evaluateMutation({
      tenantId: 'tenantA',
      operation: 'create_campaign',
      requireExplicitBudget: true,
      nextBudget: { dailyBudget: 200 },
    });
    now += 1000;

    expect(() =>
      engine.evaluateMutation({
        tenantId: 'tenantA',
        operation: 'create_campaign',
        requireExplicitBudget: true,
        nextBudget: { dailyBudget: 300 },
      })
    ).toThrow(/exceeded mutation limit/);
  });
});
