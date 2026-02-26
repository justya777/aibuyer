import { describe, it, expect } from 'vitest';
import { RetryStateMachine, FixCategory } from './retry-state-machine';

describe('RetryStateMachine', () => {
  it('allows first retry for any category', () => {
    const sm = new RetryStateMachine();
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(true);
    expect(sm.canRetry(FixCategory.ADVANTAGE_AUDIENCE)).toBe(true);
    expect(sm.canRetry(FixCategory.CREATIVE_URL)).toBe(true);
  });

  it('blocks retry after max attempts for single-attempt categories', () => {
    const sm = new RetryStateMachine();
    expect(sm.markApplied(FixCategory.BID_REQUIRED)).toBe(true);
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(false);
    expect(sm.markApplied(FixCategory.BID_REQUIRED)).toBe(false);
  });

  it('allows 2 attempts for creative_url', () => {
    const sm = new RetryStateMachine();
    expect(sm.markApplied(FixCategory.CREATIVE_URL)).toBe(true);
    expect(sm.canRetry(FixCategory.CREATIVE_URL)).toBe(true);
    expect(sm.markApplied(FixCategory.CREATIVE_URL)).toBe(true);
    expect(sm.canRetry(FixCategory.CREATIVE_URL)).toBe(false);
  });

  it('tracks applied fixes without duplicates', () => {
    const sm = new RetryStateMachine();
    sm.markApplied(FixCategory.BID_REQUIRED);
    sm.markApplied(FixCategory.LOCALE_MISMATCH);
    const applied = sm.getAppliedFixes();
    expect(applied).toContain(FixCategory.BID_REQUIRED);
    expect(applied).toContain(FixCategory.LOCALE_MISMATCH);
    expect(applied).toHaveLength(2);
  });

  it('reports wasApplied correctly', () => {
    const sm = new RetryStateMachine();
    expect(sm.wasApplied(FixCategory.BUDGET_MISSING)).toBe(false);
    sm.markApplied(FixCategory.BUDGET_MISSING);
    expect(sm.wasApplied(FixCategory.BUDGET_MISSING)).toBe(true);
  });

  it('tracks total attempts across categories', () => {
    const sm = new RetryStateMachine();
    sm.markApplied(FixCategory.BID_REQUIRED);
    sm.markApplied(FixCategory.CREATIVE_URL);
    sm.markApplied(FixCategory.CREATIVE_URL);
    expect(sm.totalAttempts()).toBe(3);
  });

  it('reset clears all state', () => {
    const sm = new RetryStateMachine();
    sm.markApplied(FixCategory.BID_REQUIRED);
    sm.markApplied(FixCategory.ADVANTAGE_AUDIENCE);
    sm.reset();
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(true);
    expect(sm.canRetry(FixCategory.ADVANTAGE_AUDIENCE)).toBe(true);
    expect(sm.getAppliedFixes()).toHaveLength(0);
    expect(sm.totalAttempts()).toBe(0);
  });

  it('supports custom max attempts via overrides', () => {
    const sm = new RetryStateMachine({ [FixCategory.BID_REQUIRED]: 3 });
    sm.markApplied(FixCategory.BID_REQUIRED);
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(true);
    sm.markApplied(FixCategory.BID_REQUIRED);
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(true);
    sm.markApplied(FixCategory.BID_REQUIRED);
    expect(sm.canRetry(FixCategory.BID_REQUIRED)).toBe(false);
  });

  it('independent categories do not interfere', () => {
    const sm = new RetryStateMachine();
    sm.markApplied(FixCategory.BID_REQUIRED);
    expect(sm.canRetry(FixCategory.ADVANTAGE_AUDIENCE)).toBe(true);
    expect(sm.canRetry(FixCategory.LOCALE_MISMATCH)).toBe(true);
  });
});
