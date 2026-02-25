export type NormalizedErrorCategory =
  | 'billing'
  | 'default_page'
  | 'dsa'
  | 'bid_required'
  | 'advantage_audience'
  | 'permissions'
  | 'invalid_parameter'
  | 'rate_limit'
  | 'generic';

export interface NormalizedExecutionError {
  category: NormalizedErrorCategory;
  blocking: boolean;
  userTitle: string;
  userMessage: string;
  nextSteps: string[];
  rationale: string;
  debug: {
    raw: string;
    code?: number | string;
    subcode?: number | string;
    fbtraceId?: string;
    requestId?: string;
  };
}

export function normalizeExecutionError(error: unknown): NormalizedExecutionError {
  const raw = stringifyError(error);
  const normalized = raw.toLowerCase();
  const parsed = parseErrorPayload(raw);
  const code = parsed.code;
  const subcode = parsed.subcode;
  const fbtraceId = parsed.fbtraceId;

  if (
    parsed.knownCode === 'PAYMENT_METHOD_REQUIRED' ||
    normalized.includes('payment_method_required') ||
    normalized.includes('no payment method') ||
    normalized.includes('billing and payment centre') ||
    normalized.includes('subcode=1359188')
  ) {
    return {
      category: 'billing',
      blocking: true,
      userTitle: 'Billing setup required',
      userMessage:
        'Meta blocked this action because this ad account does not have a valid payment method.',
      nextSteps:
        parsed.nextSteps.length > 0
          ? parsed.nextSteps
          : [
              'Open Meta Ads Manager for this ad account.',
              'Go to Billing and payments and add or confirm a payment method.',
              'Retry this command.',
            ],
      rationale: 'Campaign creation cannot continue until billing prerequisites are met.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (
    parsed.knownCode === 'DEFAULT_PAGE_REQUIRED' ||
    normalized.includes('default_page_required') ||
    normalized.includes('select a default page') ||
    normalized.includes('no promotable page found')
  ) {
    return {
      category: 'default_page',
      blocking: true,
      userTitle: 'Default Facebook Page required',
      userMessage:
        'Lead/link ads require a default Facebook Page connected to this ad account.',
      nextSteps:
        parsed.nextSteps.length > 0
          ? parsed.nextSteps
          : [
              'Set a default Page for this ad account.',
              'Make sure the page is connected and selectable in the business.',
              'Retry this command.',
            ],
      rationale: 'Meta requires a promotable Page before ad set/ad creation.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (
    parsed.knownCode === 'DSA_REQUIRED' ||
    normalized.includes('dsa_required') ||
    normalized.includes('set dsa payor/beneficiary') ||
    normalized.includes('beneficiary') && normalized.includes('payer')
  ) {
    return {
      category: 'dsa',
      blocking: true,
      userTitle: 'DSA information is missing',
      userMessage:
        'This account is missing required beneficiary/payer fields for EU-targeted ads.',
      nextSteps:
        parsed.nextSteps.length > 0
          ? parsed.nextSteps
          : [
              'Open DSA settings for this ad account.',
              'Set beneficiary and payer (or use autofill).',
              'Retry this command.',
            ],
      rationale: 'EU-targeted delivery is blocked until DSA data is configured.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (normalized.includes('bid amount required')) {
    return {
      category: 'bid_required',
      blocking: false,
      userTitle: 'Bid value required by Meta',
      userMessage:
        'Meta requires an explicit bid amount for this optimization setup. We can auto-apply a safe fallback and retry.',
      nextSteps: ['Retry the command. The system will apply a fallback bid cap automatically.'],
      rationale: 'The ad set request is valid except for a required bid constraint.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (
    normalized.includes('advantage audience flag required') ||
    normalized.includes('advantage audience')
  ) {
    return {
      category: 'advantage_audience',
      blocking: false,
      userTitle: 'Advantage Audience setting required',
      userMessage:
        'Meta expects an explicit Advantage Audience flag in targeting. We can set a compatible default and retry.',
      nextSteps: [
        'Retry the command. The system will set targetingAutomation.advantageAudience automatically.',
      ],
      rationale: 'The request needs an explicit targeting automation flag to be accepted.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (
    normalized.includes('too many api calls') ||
    normalized.includes('too many calls') ||
    normalized.includes('user request limit reached') ||
    (code !== undefined && Number(code) === 17) ||
    (code !== undefined && Number(code) === 32) ||
    (subcode !== undefined && Number(subcode) === 2446079)
  ) {
    return {
      category: 'rate_limit',
      blocking: false,
      userTitle: 'Rate limit hit',
      userMessage:
        'Meta is temporarily throttling requests for this ad account. The system will automatically retry after a short delay.',
      nextSteps: [
        'Wait a few seconds and retry.',
        'If repeated, reduce the number of concurrent operations.',
      ],
      rationale: 'Meta enforces per-account and per-app rate limits. Backing off and retrying resolves transient throttles.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (
    normalized.includes('permission') ||
    normalized.includes('not authorized') ||
    normalized.includes('insufficient permission') ||
    normalized.includes('code=10')
  ) {
    return {
      category: 'permissions',
      blocking: true,
      userTitle: 'Permissions issue',
      userMessage:
        'The connected Meta user or token does not have enough permissions for this action.',
      nextSteps: [
        'Verify this user has Admin/Advertiser rights for the ad account and page.',
        'Reconnect token/session if needed.',
        'Retry this command.',
      ],
      rationale: 'Meta denied access before processing the operation.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  if (normalized.includes('invalid parameter') || normalized.includes('blame_field_specs')) {
    return {
      category: 'invalid_parameter',
      blocking: false,
      userTitle: 'Some fields were rejected',
      userMessage: 'Meta rejected one or more submitted fields for this account/objective.',
      nextSteps: [
        'Review the suggested fixes in this step.',
        'Retry after adjusting targeting/creative if needed.',
      ],
      rationale: 'The payload shape is close, but at least one field is not accepted.',
      debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
    };
  }

  return {
    category: 'generic',
    blocking: false,
    userTitle: 'Execution error',
    userMessage: 'Meta rejected this step. You can review details and retry.',
    nextSteps: ['Check the error details and retry the command.'],
    rationale: 'The step failed with an unclassified API error.',
    debug: { raw, code, subcode, fbtraceId, requestId: parsed.requestId },
  };
}

function parseErrorPayload(raw: string): {
  knownCode?: 'DSA_REQUIRED' | 'DEFAULT_PAGE_REQUIRED' | 'PAYMENT_METHOD_REQUIRED';
  nextSteps: string[];
  code?: number | string;
  subcode?: number | string;
  fbtraceId?: string;
  requestId?: string;
} {
  let knownCode:
    | 'DSA_REQUIRED'
    | 'DEFAULT_PAGE_REQUIRED'
    | 'PAYMENT_METHOD_REQUIRED'
    | undefined;
  let nextSteps: string[] = [];
  let code: number | string | undefined;
  let subcode: number | string | undefined;
  let fbtraceId: string | undefined;
  let requestId: string | undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.code === 'string') {
      if (parsed.code === 'DSA_REQUIRED') knownCode = 'DSA_REQUIRED';
      if (parsed.code === 'DEFAULT_PAGE_REQUIRED') knownCode = 'DEFAULT_PAGE_REQUIRED';
      if (parsed.code === 'PAYMENT_METHOD_REQUIRED') knownCode = 'PAYMENT_METHOD_REQUIRED';
      code = parsed.code;
    }
    if (Array.isArray(parsed.nextSteps)) {
      nextSteps = parsed.nextSteps.map((entry) => String(entry)).filter(Boolean);
    }
    if (typeof parsed.error_subcode === 'number' || typeof parsed.error_subcode === 'string') {
      subcode = parsed.error_subcode;
    }
    if (typeof parsed.fbtrace_id === 'string') {
      fbtraceId = parsed.fbtrace_id;
    }
    if (typeof parsed.request_id === 'string') {
      requestId = parsed.request_id;
    }
  } catch {
    // Ignore JSON parse failure and fallback to regex parsing.
  }

  const codeMatch = raw.match(/code=(\d+)/i);
  if (!code && codeMatch?.[1]) code = Number(codeMatch[1]);
  const subcodeMatch = raw.match(/subcode=(\d+)/i);
  if (!subcode && subcodeMatch?.[1]) subcode = Number(subcodeMatch[1]);
  const traceMatch = raw.match(/fbtrace[_\s-]*id[=:]\s*([a-z0-9_-]+)/i);
  if (!fbtraceId && traceMatch?.[1]) fbtraceId = traceMatch[1];
  const requestMatch = raw.match(/request[_\s-]*id[=:]\s*([a-z0-9_-]+)/i);
  if (!requestId && requestMatch?.[1]) requestId = requestMatch[1];

  return { knownCode, nextSteps, code, subcode, fbtraceId, requestId };
}

function stringifyError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
