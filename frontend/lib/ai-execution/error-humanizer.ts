export type HumanizedGraphError = {
  userMessage: string;
  explanation: string;
  technicalDetails: string;
  autoFix?: string;
};

export function mapGraphError(error: unknown): HumanizedGraphError {
  const technicalDetails = stringifyError(error);
  const normalized = technicalDetails.toLowerCase();

  if (
    normalized.includes('payment_method_required') ||
    normalized.includes('no payment method') ||
    normalized.includes('billing and payment centre') ||
    normalized.includes('subcode=1359188')
  ) {
    return {
      userMessage: 'A valid payment method is required for this ad account.',
      explanation:
        'Meta blocks ad delivery until billing is configured for the selected ad account.',
      technicalDetails,
    };
  }

  if (normalized.includes('bid amount required')) {
    return {
      userMessage: 'Meta requires a bid amount for this optimization strategy.',
      explanation:
        'The selected bid strategy needs a bid cap or target cost value before the ad set can be created.',
      technicalDetails,
      autoFix: 'Applied a safe fallback bid cap and retried automatically.',
    };
  }

  if (normalized.includes('advantage audience flag required')) {
    return {
      userMessage: 'Meta requires an explicit Advantage Audience setting.',
      explanation:
        'The ad set targeting must include whether Advantage Audience is enabled or disabled.',
      technicalDetails,
      autoFix: 'Set Advantage Audience to disabled and retried automatically.',
    };
  }

  if (
    normalized.includes('permission') ||
    normalized.includes('not authorized') ||
    normalized.includes('insufficient permission') ||
    normalized.includes('code=10')
  ) {
    return {
      userMessage: 'This account does not have permission to complete this action.',
      explanation:
        'Meta rejected the request because the current token or user role lacks the required permissions.',
      technicalDetails,
    };
  }

  if (normalized.includes('invalid parameter')) {
    return {
      userMessage: 'Meta rejected one of the submitted fields.',
      explanation:
        'At least one request field is not accepted by Meta for the selected objective or account setup.',
      technicalDetails,
    };
  }

  return {
    userMessage: 'Meta rejected the request while processing this step.',
    explanation: 'The request was sent correctly but Meta returned an error response.',
    technicalDetails,
  };
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
