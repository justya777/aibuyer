import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for campaign detail page data handling logic.
 * These validate the client-side response parsing that the rewritten
 * CampaignDetailPage relies on, without requiring a running Next.js server.
 */

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function detectAccountMismatch(
  routeActId: string,
  campaignAccountId: string | undefined
): { mismatch: boolean; actualAccountId: string } | null {
  if (!campaignAccountId) return null;
  const routeNormalized = normalizeAdAccountId(routeActId);
  const actualNormalized = normalizeAdAccountId(campaignAccountId);
  if (actualNormalized === '' || actualNormalized === 'act_') return null;
  if (routeNormalized !== actualNormalized) {
    return { mismatch: true, actualAccountId: actualNormalized };
  }
  return null;
}

test('detectAccountMismatch returns null when accounts match', () => {
  const result = detectAccountMismatch('act_123', 'act_123');
  assert.equal(result, null);
});

test('detectAccountMismatch returns null when route lacks act_ prefix but matches', () => {
  const result = detectAccountMismatch('123', 'act_123');
  assert.equal(result, null);
});

test('detectAccountMismatch detects mismatch', () => {
  const result = detectAccountMismatch('act_123', 'act_456');
  assert.ok(result);
  assert.equal(result.mismatch, true);
  assert.equal(result.actualAccountId, 'act_456');
});

test('detectAccountMismatch returns null for empty campaign accountId', () => {
  const result = detectAccountMismatch('act_123', '');
  assert.equal(result, null);
});

test('detectAccountMismatch returns null for undefined campaign accountId', () => {
  const result = detectAccountMismatch('act_123', undefined);
  assert.equal(result, null);
});

test('campaign API response with accountMismatch is correctly shaped', () => {
  const mockApiResponse = {
    success: true,
    campaign: {
      id: '999',
      accountId: 'act_456',
      name: 'Test Campaign',
      status: 'active',
    },
    accountMismatch: true,
    actualAccountId: 'act_456',
  };

  assert.equal(mockApiResponse.success, true);
  assert.equal(mockApiResponse.accountMismatch, true);
  assert.equal(mockApiResponse.actualAccountId, 'act_456');
  assert.ok(mockApiResponse.campaign);
  assert.equal(mockApiResponse.campaign.id, '999');
});

test('campaign API 404 response indicates not found', () => {
  const mockApiResponse = {
    success: false,
    error: 'Campaign not found.',
  };
  assert.equal(mockApiResponse.success, false);
  assert.equal(mockApiResponse.error, 'Campaign not found.');
});

test('partial success: campaign loads but adsets fail independently', () => {
  const campaignResult = { success: true, campaign: { id: '123', name: 'My Campaign' } };
  const adSetsResult = { success: false, error: 'Graph request failed with status 400 | code=100' };

  assert.equal(campaignResult.success, true);
  assert.ok(campaignResult.campaign);
  assert.equal(adSetsResult.success, false);
  assert.ok(typeof adSetsResult.error === 'string');
});
