import { clampProjects, hasPerm, type Principal } from '../auth/principal';

export interface AnalyticsScope {
  /** Restrict service-derived metrics to these projects. undefined = unrestricted. */
  projectUuids?: string[];
  /**
   * true only for a caller-requested ?projects= filter (never for a member's implicit clamp):
   * it narrows account-level blocks to providers serving the filtered projects, while the
   * implicit clamp keeps them account-wide ("grant = sees all").
   */
  explicitFilter: boolean;
  /** Provider balances / runway / top-ups. */
  includeBalances: boolean;
  /** Payment-derived KPIs: totalSpent, currentMonthPayments, byProvider.spent, forecast actuals. */
  includePayments: boolean;
}

export const UNRESTRICTED: Readonly<AnalyticsScope> = Object.freeze({
  explicitFilter: false,
  includeBalances: true,
  includePayments: true,
});

/**
 * Providers whose balances/payments stay visible under this scope: with an explicit
 * filter, only those serving the scoped services; otherwise all (null = no narrowing).
 * Both summary() and forecast() must derive the set this way or their KPIs disagree.
 */
export function relevantProviderUuids(
  scope: AnalyticsScope,
  scopedServices: ReadonlyArray<{ providerUuid: string }>,
): Set<string> | null {
  return scope.explicitFilter ? new Set(scopedServices.map((s) => s.providerUuid)) : null;
}

export function resolveAnalyticsScope(
  principal: Principal,
  requested: string[] | undefined,
): AnalyticsScope {
  return {
    projectUuids: clampProjects(principal, requested),
    explicitFilter: (requested?.length ?? 0) > 0,
    includeBalances: hasPerm(principal, 'providers:read'),
    includePayments: hasPerm(principal, 'payments:read'),
  };
}
