import { isEuTargeting } from '../fb/dsa.js';

describe('isEuTargeting', () => {
  it('returns true when at least one EU country is targeted', () => {
    expect(isEuTargeting(['US', 'RO'])).toBe(true);
    expect(isEuTargeting(['pl'])).toBe(true);
  });

  it('returns false for non-EU countries', () => {
    expect(isEuTargeting(['US', 'CA', 'BR'])).toBe(false);
  });
});
