export const CONTROLLERS_INFO = {
  AUTH: { TAG: 'Auth', DESCRIPTION: 'Admin login, session and passkeys (session-only)' },
  API_TOKENS: { TAG: 'API Tokens', DESCRIPTION: 'Create and revoke API tokens (session-only)' },
  PROVIDERS: { TAG: 'Providers', DESCRIPTION: 'Hosting providers and merging duplicates' },
  PROVIDER_ACCOUNTS: {
    TAG: 'Provider Accounts',
    DESCRIPTION: 'Accounts at a provider: credentials, balance and sync',
  },
  PROJECTS: { TAG: 'Projects', DESCRIPTION: 'Group services by project' },
  SYNC: { TAG: 'Sync', DESCRIPTION: 'Trigger and inspect provider syncs' },
  SERVICES: { TAG: 'Services', DESCRIPTION: 'Paid resources at providers' },
  PAYMENTS: { TAG: 'Payments', DESCRIPTION: 'Log of actual payments' },
  ANALYTICS: { TAG: 'Analytics', DESCRIPTION: 'Spend summary and forecast' },
  BALANCE_HISTORY: {
    TAG: 'Balance History',
    DESCRIPTION: 'Account balance snapshots and daily spend',
  },
  RATES: { TAG: 'Exchange Rates', DESCRIPTION: 'Currency rates to the base currency' },
  SETTINGS: { TAG: 'Settings', DESCRIPTION: 'Panel settings' },
  NOTIFICATIONS: { TAG: 'Notifications', DESCRIPTION: 'Outgoing Telegram notifications' },
  HEALTH: { TAG: 'Health', DESCRIPTION: 'Liveness check' },
  BUILD_INFO: { TAG: 'Build Info', DESCRIPTION: 'Build metadata' },
} as const;
