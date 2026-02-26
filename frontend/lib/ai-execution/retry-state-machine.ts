export enum FixCategory {
  BID_REQUIRED = 'bid_required',
  ADVANTAGE_AUDIENCE = 'advantage_audience',
  LOCALE_MISMATCH = 'locale_mismatch',
  CREATIVE_URL = 'creative_url',
  CAMPAIGN_ID_PLACEHOLDER = 'campaign_id_placeholder',
  BUDGET_MISSING = 'budget_missing',
  RATE_LIMIT = 'rate_limit',
}

interface CategoryState {
  applied: boolean;
  attempts: number;
  maxAttempts: number;
}

const DEFAULT_MAX_ATTEMPTS: Record<FixCategory, number> = {
  [FixCategory.BID_REQUIRED]: 2,
  [FixCategory.ADVANTAGE_AUDIENCE]: 2,
  [FixCategory.LOCALE_MISMATCH]: 1,
  [FixCategory.CREATIVE_URL]: 2,
  [FixCategory.CAMPAIGN_ID_PLACEHOLDER]: 1,
  [FixCategory.BUDGET_MISSING]: 1,
  [FixCategory.RATE_LIMIT]: 3,
};

export class RetryStateMachine {
  private readonly state: Map<FixCategory, CategoryState>;

  constructor(overrides?: Partial<Record<FixCategory, number>>) {
    this.state = new Map();
    for (const category of Object.values(FixCategory)) {
      this.state.set(category, {
        applied: false,
        attempts: 0,
        maxAttempts: overrides?.[category] ?? DEFAULT_MAX_ATTEMPTS[category],
      });
    }
  }

  canRetry(category: FixCategory): boolean {
    const s = this.state.get(category);
    if (!s) return false;
    return s.attempts < s.maxAttempts;
  }

  markApplied(category: FixCategory): boolean {
    const s = this.state.get(category);
    if (!s || s.attempts >= s.maxAttempts) return false;
    s.applied = true;
    s.attempts += 1;
    return true;
  }

  wasApplied(category: FixCategory): boolean {
    return this.state.get(category)?.applied ?? false;
  }

  getAppliedFixes(): FixCategory[] {
    const applied: FixCategory[] = [];
    for (const [category, s] of this.state) {
      if (s.applied) applied.push(category);
    }
    return applied;
  }

  getAttempts(category: FixCategory): number {
    return this.state.get(category)?.attempts ?? 0;
  }

  totalAttempts(): number {
    let total = 0;
    for (const s of this.state.values()) {
      total += s.attempts;
    }
    return total;
  }

  reset(): void {
    for (const s of this.state.values()) {
      s.applied = false;
      s.attempts = 0;
    }
  }
}
