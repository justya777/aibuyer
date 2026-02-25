import { describe, it, expect } from 'vitest';
import { parseTargetingConstraints, enforceTargetingConstraints } from './constraint-parser';

describe('parseTargetingConstraints', () => {
  it('parses Romanian language + country + age + interests, gender stays undefined', () => {
    const result = parseTargetingConstraints(
      'Create a leads campaign for Romanians on romanian language aged 25-45 interested in investments with $15 daily budget'
    );
    expect(result.language).toBe('romanian');
    expect(result.localeNames).toEqual(['romanian']);
    expect(result.localeIds).toBeUndefined();
    expect(result.ageMin).toBe(25);
    expect(result.ageMax).toBe(45);
    expect(result.countries).toEqual(['RO']);
    expect(result.interests).toEqual(['investments']);
    expect(result.gender).toBeUndefined();
  });

  it('"Romanians" alone does NOT imply female gender', () => {
    const result = parseTargetingConstraints(
      'Create a campaign for Romanians aged 20-40'
    );
    expect(result.countries).toEqual(['RO']);
    expect(result.gender).toBeUndefined();
  });

  it('parses explicit male gender', () => {
    const result = parseTargetingConstraints(
      'Create a leads campaign for Romanian men aged 30-50'
    );
    expect(result.countries).toEqual(['RO']);
    expect(result.gender).toBe('male');
    expect(result.ageMin).toBe(30);
    expect(result.ageMax).toBe(50);
  });

  it('parses explicit female gender', () => {
    const result = parseTargetingConstraints(
      'Create campaign for women in Germany'
    );
    expect(result.countries).toEqual(['DE']);
    expect(result.gender).toBe('female');
  });

  it('parses "in romanian" language pattern', () => {
    const result = parseTargetingConstraints(
      'Create a campaign in romanian for users aged 18-35'
    );
    expect(result.language).toBe('romanian');
    expect(result.localeNames).toEqual(['romanian']);
    expect(result.ageMin).toBe(18);
    expect(result.ageMax).toBe(35);
  });

  it('passes language name for MCP resolution instead of hardcoded ID', () => {
    const result = parseTargetingConstraints(
      'Target Romanians on romanian language'
    );
    expect(result.language).toBe('romanian');
    expect(result.localeNames).toEqual(['romanian']);
    expect(result.localeIds).toBeUndefined();
  });

  it('returns empty constraints for unrelated command', () => {
    const result = parseTargetingConstraints('Pause all campaigns');
    expect(result.language).toBeUndefined();
    expect(result.localeNames).toBeUndefined();
    expect(result.localeIds).toBeUndefined();
    expect(result.countries).toBeUndefined();
    expect(result.gender).toBeUndefined();
    expect(result.ageMin).toBeUndefined();
    expect(result.ageMax).toBeUndefined();
  });

  it('parses multiple countries', () => {
    const result = parseTargetingConstraints(
      'Create campaign for Romanians and Bulgarians aged 25-45'
    );
    expect(result.countries).toContain('RO');
    expect(result.countries).toContain('BG');
  });

  it('parses age with "to" syntax', () => {
    const result = parseTargetingConstraints(
      'Target users aged 20 to 50 in Romania'
    );
    expect(result.ageMin).toBe(20);
    expect(result.ageMax).toBe(50);
  });
});

describe('enforceTargetingConstraints', () => {
  it('overwrites wrong locales with language name for MCP resolution', () => {
    const toolArgs = { targeting: { locales: [28] } };
    const constraints = { language: 'romanian', localeNames: ['romanian'] };
    const fixes = enforceTargetingConstraints(toolArgs, constraints);
    expect(toolArgs.targeting.locales).toEqual(['romanian']);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]).toContain('romanian');
  });

  it('removes AI-hallucinated gender when user did not specify', () => {
    const toolArgs = { targeting: { genders: [2] } };
    const constraints: any = {};
    const fixes = enforceTargetingConstraints(toolArgs, constraints);
    expect(toolArgs.targeting.genders).toBeUndefined();
    expect(fixes.some((f: string) => f.includes('hallucinated'))).toBe(true);
  });

  it('enforces male gender when specified', () => {
    const toolArgs = { targeting: { genders: [2] } };
    const constraints = { gender: 'male' as const };
    const fixes = enforceTargetingConstraints(toolArgs, constraints);
    expect(toolArgs.targeting.genders).toEqual([1]);
    expect(fixes.some((f: string) => f.includes('male'))).toBe(true);
  });

  it('injects missing countries', () => {
    const toolArgs = { targeting: {} };
    const constraints = { countries: ['RO'] };
    const fixes = enforceTargetingConstraints(toolArgs, constraints);
    expect(toolArgs.targeting.geoLocations.countries).toEqual(['RO']);
    expect(fixes.some((f: string) => f.includes('RO'))).toBe(true);
  });

  it('does not produce fixes when locales already match language name', () => {
    const toolArgs = {
      targeting: {
        locales: ['romanian'],
        genders: [1],
        geoLocations: { countries: ['RO'] },
        ageMin: 25,
        ageMax: 45,
      },
    };
    const constraints = {
      language: 'romanian',
      localeNames: ['romanian'],
      gender: 'male' as const,
      countries: ['RO'],
      ageMin: 25,
      ageMax: 45,
    };
    const fixes = enforceTargetingConstraints(toolArgs, constraints);
    expect(fixes).toEqual([]);
  });
});
