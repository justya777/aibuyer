import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExecutionError } from './error-normalizer';

test('normalizes payment method blocking errors', () => {
  const normalized = normalizeExecutionError(
    'Graph request failed with status 400 | code=100 | subcode=1359188 | message=No payment method'
  );
  assert.equal(normalized.category, 'billing');
  assert.equal(normalized.blocking, true);
  assert.match(normalized.userTitle, /billing/i);
  assert.ok(normalized.nextSteps.length > 0);
});

test('normalizes default page errors', () => {
  const normalized = normalizeExecutionError(
    'DEFAULT_PAGE_REQUIRED: Select a default Page for this ad account'
  );
  assert.equal(normalized.category, 'default_page');
  assert.equal(normalized.blocking, true);
  assert.match(normalized.userMessage, /default facebook page/i);
});

test('normalizes bid and advantage requirements as non-blocking', () => {
  const bid = normalizeExecutionError('Bid amount required');
  const aa = normalizeExecutionError('Advantage audience flag required');
  assert.equal(bid.category, 'bid_required');
  assert.equal(bid.blocking, false);
  assert.equal(aa.category, 'advantage_audience');
  assert.equal(aa.blocking, false);
});

test('normalizes rate limit error from code=17', () => {
  const normalized = normalizeExecutionError(
    'Graph request failed with status 400 | code=17 | subcode=2446079 | message=Application request limit reached'
  );
  assert.equal(normalized.category, 'rate_limit');
  assert.equal(normalized.blocking, false);
  assert.match(normalized.userTitle, /rate limit/i);
  assert.ok(normalized.nextSteps.length > 0);
});

test('normalizes rate limit error from "too many API calls" message', () => {
  const normalized = normalizeExecutionError(
    '(#17) User request limit reached: too many API calls to this account'
  );
  assert.equal(normalized.category, 'rate_limit');
  assert.equal(normalized.blocking, false);
});

test('normalizes rate limit error from code=32', () => {
  const normalized = normalizeExecutionError(
    'Graph request failed with status 400 | code=32 | message=Too many calls'
  );
  assert.equal(normalized.category, 'rate_limit');
  assert.equal(normalized.blocking, false);
});

test('normalizes rate limit from JSON payload with subcode 2446079', () => {
  const normalized = normalizeExecutionError(
    JSON.stringify({ code: 'RATE_LIMIT', error_subcode: 2446079, message: 'User request limit reached' })
  );
  assert.equal(normalized.category, 'rate_limit');
  assert.equal(normalized.blocking, false);
});
