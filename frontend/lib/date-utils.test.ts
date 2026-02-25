import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime, safeDateFormat, safeTimeFormat, toIsoDateString } from './date-utils';

test('safe formatters never return Invalid Date', () => {
  assert.notEqual(safeDateFormat('invalid-date-value'), 'Invalid Date');
  assert.notEqual(safeTimeFormat('invalid-date-value'), 'Invalid Date');
  assert.equal(safeDateFormat('invalid-date-value'), '--/--/----');
  assert.equal(safeTimeFormat('invalid-date-value'), '--:--:--');
});

test('toIsoDateString returns null for invalid values', () => {
  assert.equal(toIsoDateString(undefined), null);
  assert.equal(toIsoDateString(null), null);
  assert.equal(toIsoDateString('not-a-date'), null);
});

test('formatDateTime accepts ISO input', () => {
  const iso = '2026-02-25T10:15:20.000Z';
  const rendered = formatDateTime(iso);
  assert.ok(rendered.length > 0);
  assert.notEqual(rendered, '--');
});
