import { redactSensitivePayload } from '../utils/logger.js';

describe('security redaction', () => {
  it('redacts token and secret fields recursively', () => {
    const payload = {
      access_token: 'abc123',
      nested: {
        Authorization: 'Bearer super-secret',
        apiSecret: 'hidden',
      },
      safeField: 'ok',
    };

    const redacted = redactSensitivePayload(payload);
    expect(redacted.access_token).toBe('[REDACTED]');
    expect(redacted.nested.Authorization).toBe('[REDACTED]');
    expect(redacted.nested.apiSecret).toBe('[REDACTED]');
    expect(redacted.safeField).toBe('ok');
  });

  it('redacts token patterns in strings', () => {
    const message =
      'POST /x?access_token=token-value&token=abc123 Authorization: Bearer token-value {"secret":"a1"}';
    const redacted = redactSensitivePayload(message);
    expect(redacted).toContain('access_token=[REDACTED]');
    expect(redacted).toContain('token=[REDACTED]');
    expect(redacted).not.toContain('token-value');
    expect(redacted).toContain('"secret":"[REDACTED]"');
  });
});
