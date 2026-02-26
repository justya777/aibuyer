/**
 * Shared query builder for Meta Graph API requests.
 * Enforces correct types (e.g., effective_status always JSON-encoded array)
 * across all routes.
 */
export class QueryBuilder {
  private readonly params: Record<string, string | undefined> = {};

  withEffectiveStatus(statuses: string[] | undefined): this {
    if (statuses && statuses.length > 0) {
      this.params.effective_status = JSON.stringify(statuses);
    }
    return this;
  }

  withFields(fields: string[]): this {
    if (fields.length > 0) {
      this.params.fields = fields.join(',');
    }
    return this;
  }

  withLimit(limit: number): this {
    this.params.limit = String(Math.max(1, Math.min(200, limit)));
    return this;
  }

  withParam(key: string, value: string | undefined): this {
    this.params[key] = value;
    return this;
  }

  build(): Record<string, string | undefined> {
    return { ...this.params };
  }
}

export function graphQuery(): QueryBuilder {
  return new QueryBuilder();
}
