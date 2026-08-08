export interface OpenRouterCredentials {
  token: string;
  useCatalogNames?: boolean;
}

export function parseOpenRouterCredentials(raw: string): OpenRouterCredentials {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'token' in parsed) {
      const o = parsed as OpenRouterCredentials;
      return {
        token: String(o.token ?? ''),
        useCatalogNames: o.useCatalogNames !== false,
      };
    }
  } catch {
    /* legacy bare management key */
  }
  return { token: raw, useCatalogNames: true };
}

/** GET /api/v1/credits — management key only. */
export interface OpenRouterCreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

/** One row from GET /api/v1/activity (last ~30 UTC days, per model/day). */
export interface OpenRouterActivityItem {
  date: string;
  model: string;
  model_permaslug?: string;
  provider_name?: string;
  usage: number;
  requests: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface OpenRouterActivityResponse {
  data: OpenRouterActivityItem[];
}

/** GET /api/v1/key — used only to reject non-management keys early. */
export interface OpenRouterSelfKeyResponse {
  data: {
    is_management_key?: boolean;
    label?: string;
  };
}

/** GET /api/v1/models — public catalog; `name` is the human-readable label. */
export interface OpenRouterModelsResponse {
  data: Array<{
    id: string;
    name?: string;
  }>;
}
