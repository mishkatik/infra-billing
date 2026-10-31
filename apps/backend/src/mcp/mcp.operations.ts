import { API_PATH, ID_PARAM } from '@infra/shared';

export type McpAccess = 'read' | 'write' | 'destructive';
export type McpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface McpOperationSpec {
  /** Stable name an MCP client passes to describe_operation / call_operation. */
  name: string;
  method: McpMethod;
  /** Prefix-relative path in OpenAPI form (`/services/{uuid}`). */
  path: string;
  access: McpAccess;
  /** What the summary and schemas don't tell. */
  notes?: string;
}

// OpenAPI placeholder for the `:uuid` route param, so API_PATH builders yield `/x/{uuid}`.
const ID = `{${ID_PARAM}}`;

/**
 * Operations exposed over MCP. Default-deny: a new endpoint stays hidden until it's listed here.
 * Deliberately left out: public and session-only routes, favicons (binary), the netcup device flow
 * (hands out a refresh token), Yandex discovery (takes a raw cloud token), deleting or merging
 * providers and accounts (cascades through payment and balance history) and settings updates
 * (would let a client point Telegram alerts at another bot or chat).
 */
export const MCP_OPERATIONS: McpOperationSpec[] = [
  // Read
  {
    name: 'analytics.summary',
    method: 'GET',
    path: API_PATH.ANALYTICS.SUMMARY,
    access: 'read',
    notes:
      'Start here for the overall picture: monthly run-rate in the base currency, upcoming and ' +
      'overdue billings, balance runway and breakdowns by type, project and provider.',
  },
  {
    name: 'analytics.forecast',
    method: 'GET',
    path: API_PATH.ANALYTICS.FORECAST,
    access: 'read',
    notes: 'Monthly spend: monthsBack of actuals plus months of forecast.',
  },
  { name: 'providers.list', method: 'GET', path: API_PATH.PROVIDERS.ROOT, access: 'read' },
  { name: 'providers.get', method: 'GET', path: API_PATH.PROVIDERS.BY_ID(ID), access: 'read' },
  {
    name: 'accounts.syncRuns',
    method: 'GET',
    path: API_PATH.PROVIDER_ACCOUNTS.SYNC_RUNS(ID),
    access: 'read',
  },
  {
    name: 'accounts.balanceHistory',
    method: 'GET',
    path: API_PATH.PROVIDER_ACCOUNTS.BALANCE_HISTORY(ID),
    access: 'read',
  },
  {
    name: 'accounts.spend',
    method: 'GET',
    path: API_PATH.PROVIDER_ACCOUNTS.SPEND(ID),
    access: 'read',
  },
  { name: 'projects.list', method: 'GET', path: API_PATH.PROJECTS.ROOT, access: 'read' },
  { name: 'projects.stats', method: 'GET', path: API_PATH.PROJECTS.STATS(ID), access: 'read' },
  { name: 'services.list', method: 'GET', path: API_PATH.SERVICES.ROOT, access: 'read' },
  {
    name: 'payments.list',
    method: 'GET',
    path: API_PATH.PAYMENTS.ROOT,
    access: 'read',
    notes: 'Paginated: page (default 1), pageSize (default 50, max 200).',
  },
  { name: 'rates.list', method: 'GET', path: API_PATH.RATES.ROOT, access: 'read' },
  {
    name: 'settings.get',
    method: 'GET',
    path: API_PATH.SETTINGS,
    access: 'read',
    notes: 'baseCurrency is what analytics totals are converted to.',
  },

  // Write
  {
    name: 'providers.create',
    method: 'POST',
    path: API_PATH.PROVIDERS.ROOT,
    access: 'write',
    notes: 'Credentials are write-only: responses only carry has* flags, never the secrets.',
  },
  {
    name: 'providers.update',
    method: 'PATCH',
    path: API_PATH.PROVIDERS.BY_ID(ID),
    access: 'write',
    notes: 'Identity only (name, login URL, icon). Credentials live on accounts.',
  },
  {
    name: 'providers.addAccount',
    method: 'POST',
    path: API_PATH.PROVIDERS.ACCOUNTS(ID),
    access: 'write',
    notes: 'The label is required and must be unique within the provider (409 otherwise).',
  },
  {
    name: 'providers.sync',
    method: 'POST',
    path: API_PATH.PROVIDERS.SYNC(ID),
    access: 'write',
    notes: 'Syncs every enabled account of the provider and waits for the result.',
  },
  {
    name: 'providers.syncAll',
    method: 'POST',
    path: API_PATH.PROVIDERS.SYNC_ALL,
    access: 'write',
    notes: 'Syncs every enabled account; waits for all of them and can take a minute.',
  },
  {
    name: 'accounts.update',
    method: 'PATCH',
    path: API_PATH.PROVIDER_ACCOUNTS.BY_ID(ID),
    access: 'write',
    notes: 'Omitted credential fields keep their stored values.',
  },
  {
    name: 'accounts.sync',
    method: 'POST',
    path: API_PATH.PROVIDER_ACCOUNTS.SYNC(ID),
    access: 'write',
  },
  { name: 'projects.create', method: 'POST', path: API_PATH.PROJECTS.ROOT, access: 'write' },
  { name: 'projects.update', method: 'PATCH', path: API_PATH.PROJECTS.BY_ID(ID), access: 'write' },
  {
    name: 'projects.moveAll',
    method: 'POST',
    path: API_PATH.PROJECTS.MOVE_ALL(ID),
    access: 'write',
    notes: 'Moves every service from every project into this one.',
  },
  {
    name: 'projects.empty',
    method: 'POST',
    path: API_PATH.PROJECTS.EMPTY(ID),
    access: 'write',
    notes: 'Moves this project’s services to the default project.',
  },
  {
    name: 'services.create',
    method: 'POST',
    path: API_PATH.SERVICES.ROOT,
    access: 'write',
    notes: 'Pass accountUuid, or providerUuid when the provider has exactly one account.',
  },
  {
    name: 'services.update',
    method: 'PATCH',
    path: API_PATH.SERVICES.BY_ID(ID),
    access: 'write',
    notes:
      'A manual cost or name on a synced service sticks across syncs. Moving a service to ' +
      'another account works only for manual services.',
  },
  { name: 'payments.create', method: 'POST', path: API_PATH.PAYMENTS.ROOT, access: 'write' },
  {
    name: 'rates.set',
    method: 'POST',
    path: API_PATH.RATES.ROOT,
    access: 'write',
    notes: 'Adds a manual rate.',
  },
  { name: 'rates.refresh', method: 'POST', path: API_PATH.RATES.REFRESH, access: 'write' },
  {
    name: 'rates.backfill',
    method: 'POST',
    path: API_PATH.RATES.BACKFILL,
    access: 'write',
    notes: 'Idempotent.',
  },
  {
    name: 'notifications.check',
    method: 'POST',
    path: API_PATH.NOTIFICATIONS.CHECK,
    access: 'write',
    notes: 'Runs the alert checks now; may send Telegram messages.',
  },
  {
    name: 'notifications.test',
    method: 'POST',
    path: API_PATH.NOTIFICATIONS.TEST,
    access: 'write',
    notes: 'Sends sample messages to the configured Telegram chat.',
  },

  // Destructive
  {
    name: 'services.delete',
    method: 'DELETE',
    path: API_PATH.SERVICES.BY_ID(ID),
    access: 'destructive',
  },
  {
    name: 'payments.delete',
    method: 'DELETE',
    path: API_PATH.PAYMENTS.BY_ID(ID),
    access: 'destructive',
  },
  {
    name: 'projects.delete',
    method: 'DELETE',
    path: API_PATH.PROJECTS.BY_ID(ID),
    access: 'destructive',
    notes: 'Its services move to the default project.',
  },
];
