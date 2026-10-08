import type { Provider, ProviderAccount } from '@infra/shared';
import type { InkState } from '@/components/ink/InkGlyph';

/** Where an account (or, aggregated, a provider) stands with syncing. */
export type ProviderSyncState = 'ok' | 'syncing' | 'failed' | 'never' | 'off' | 'manual';

export interface SyncActivity {
  /** Account uuids with a sync in flight in this tab. */
  syncing: Set<string>;
  /** A "sync all" is running: it covers every enabled account of an API provider. */
  all: boolean;
}

type AccountStateFields = Pick<
  ProviderAccount,
  'uuid' | 'isEnabled' | 'lastSyncAt' | 'lastSyncError'
>;

/** One account's sync state, from its record plus syncs running in this tab. */
export function accountSyncState(
  kind: string,
  a: AccountStateFields,
  activity?: SyncActivity,
): ProviderSyncState {
  if (kind === 'manual') return 'manual';
  if (!a.isEnabled) return 'off';
  if (activity && (activity.all || activity.syncing.has(a.uuid))) return 'syncing';
  if (a.lastSyncError) return 'failed';
  return a.lastSyncAt ? 'ok' : 'never';
}

// Most pressing first: a provider shows the state of its most pressing account.
const PRECEDENCE: ProviderSyncState[] = ['syncing', 'failed', 'never', 'ok'];

/** One state for the whole provider; `off` only when every account is switched off. */
export function providerSyncState(
  p: Pick<Provider, 'kind'> & { accounts: AccountStateFields[] },
  activity?: SyncActivity,
): ProviderSyncState {
  if (p.kind === 'manual') return 'manual';
  const states = new Set(p.accounts.map((a) => accountSyncState(p.kind, a, activity)));
  return PRECEDENCE.find((s) => states.has(s)) ?? 'off';
}

export const SYNC_STATE_GLYPH: Record<ProviderSyncState, InkState> = {
  ok: 'ok',
  syncing: 'progress',
  failed: 'failed',
  never: 'pending',
  off: 'off',
  manual: 'pending',
};

/** Accounts counted by sync state (a provider with three accounts counts three times). */
export function countSyncStates(
  providers: (Pick<Provider, 'kind'> & { accounts: AccountStateFields[] })[] | undefined,
  activity?: SyncActivity,
): Record<ProviderSyncState, number> {
  const counts: Record<ProviderSyncState, number> = {
    ok: 0,
    syncing: 0,
    failed: 0,
    never: 0,
    off: 0,
    manual: 0,
  };
  for (const p of providers ?? []) {
    for (const a of p.accounts) counts[accountSyncState(p.kind, a, activity)] += 1;
  }
  return counts;
}

/**
 * "Provider · label" when the provider has several accounts, just the provider name otherwise.
 * `mainLabel` names the original, unlabelled account (translated by the caller).
 */
export function accountDisplayName(
  p: Pick<Provider, 'name' | 'accounts'>,
  a: Pick<ProviderAccount, 'label'> | undefined,
  mainLabel: string,
): string {
  if (!a || p.accounts.length <= 1) return p.name;
  return `${p.name} · ${a.label ?? mainLabel}`;
}

export interface AccountRef {
  provider: Provider;
  account: ProviderAccount;
}

/** Account uuid → its provider and account, for tables and forms that hold an accountUuid. */
export function buildAccountIndex(providers: Provider[] | undefined): Map<string, AccountRef> {
  const index = new Map<string, AccountRef>();
  for (const provider of providers ?? []) {
    for (const account of provider.accounts) index.set(account.uuid, { provider, account });
  }
  return index;
}
