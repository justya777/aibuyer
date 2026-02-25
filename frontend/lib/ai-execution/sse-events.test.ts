import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStepFromSsePayload, parseTimelineDonePayload } from './sse-events';

test('buildStepFromSsePayload builds step from timeline payload', () => {
  const step = buildStepFromSsePayload({
    type: 'step.success',
    stepId: 'adset-1',
    label: 'Create ad set',
    status: 'success',
    summary: 'Ad set created.',
    ts: '2026-02-25T12:00:00.000Z',
  });

  assert.ok(step);
  assert.equal(step?.id, 'adset-1');
  assert.equal(step?.title, 'Create ad set');
  assert.equal(step?.status, 'success');
  assert.equal(step?.finishedAt, '2026-02-25T12:00:00.000Z');
});

test('parseTimelineDonePayload reads summary and createdIds', () => {
  const parsed = parseTimelineDonePayload({
    success: true,
    createdIds: { campaignId: '123' },
    summary: {
      stepsCompleted: 3,
      totalSteps: 3,
      retries: 0,
      finalStatus: 'success',
      finalMessage: 'Done',
    },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.createdIds?.campaignId, '123');
  assert.equal(parsed.summary?.finalStatus, 'success');
});
