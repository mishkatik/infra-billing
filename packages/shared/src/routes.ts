// Single source of truth for API route paths, shared by NestJS controllers and the frontend
// axios client, so the route structure stays in sync. Everything is mounted under API_PREFIX
// (backend: app.setGlobalPrefix; frontend: axios baseURL), so the paths below are prefix-relative.
//
//   Backend:  @Controller(API.PROVIDERS) + @Get(API_SUB.BY_ID) + @Param(ID_PARAM, …)
//   Frontend: API_PATH.PROVIDERS.BY_ID(uuid)  ->  "/providers/<uuid>"

export const API_PREFIX = 'api';

/** NestJS route param name + placeholder (must match between the route and @Param). */
export const ID_PARAM = 'uuid';
const ID = `:${ID_PARAM}`;

/** Controller base paths (the @Controller(...) argument). */
export const API = {
  HEALTH: 'health',
  BUILD_INFO: 'build-info',
  AUTH: 'auth',
  PROVIDERS: 'providers',
  PROJECTS: 'projects',
  SERVICES: 'services',
  PAYMENTS: 'payments',
  ANALYTICS: 'analytics',
  RATES: 'rates',
  SETTINGS: 'settings',
  NOTIFICATIONS: 'notifications',
  TOKENS: 'tokens',
} as const;

/** Method sub-paths within a controller (NestJS-style; `:uuid` for route params). */
export const API_SUB = {
  BY_ID: ID,
  AUTH_LOGIN: 'login',
  AUTH_LOGOUT: 'logout',
  AUTH_ME: 'me',
  AUTH_SETUP: 'setup',
  AUTH_CONFIG: 'config',
  AUTH_PASSKEY_LOGIN_OPTIONS: 'passkey/login/options',
  AUTH_PASSKEY_LOGIN_VERIFY: 'passkey/login/verify',
  AUTH_PASSKEY_REGISTER_OPTIONS: 'passkey/register/options',
  AUTH_PASSKEY_REGISTER_VERIFY: 'passkey/register/verify',
  AUTH_PASSKEYS: 'passkeys',
  AUTH_PASSKEY_BY_ID: `passkeys/${ID}`,
  PROJECT_MOVE_ALL: `${ID}/move-all`,
  PROJECT_EMPTY: `${ID}/empty`,
  PROJECT_STATS: `${ID}/stats`,
  PROVIDER_SYNC_ALL: 'sync-all',
  PROVIDER_SYNC: `${ID}/sync`,
  PROVIDER_SYNC_RUNS: `${ID}/sync-runs`,
  PROVIDER_BALANCE_HISTORY: `${ID}/balance-history`,
  // netcup OAuth2 device flow (in-panel token acquisition).
  PROVIDER_NETCUP_DEVICE_START: 'netcup/device/start',
  PROVIDER_NETCUP_DEVICE_POLL: 'netcup/device/poll',
  // Yandex Cloud folder / billing-account discovery for the form dropdowns.
  PROVIDER_YANDEX_DISCOVER: 'yandex/discover',
  ANALYTICS_SUMMARY: 'summary',
  ANALYTICS_FORECAST: 'forecast',
  RATES_REFRESH: 'refresh',
  NOTIFICATIONS_CHECK: 'check',
  NOTIFICATIONS_TEST: 'test',
} as const;

const path = (controller: string, sub?: string): string =>
  sub ? `/${controller}/${sub}` : `/${controller}`;
const pathId = (controller: string, sub: string, uuid: string): string =>
  `/${controller}/${sub.replace(ID, uuid)}`;

/** Concrete, prefix-relative paths for the frontend client (functions for `:uuid` routes). */
export const API_PATH = {
  HEALTH: path(API.HEALTH),
  BUILD_INFO: path(API.BUILD_INFO),
  AUTH: {
    LOGIN: path(API.AUTH, API_SUB.AUTH_LOGIN),
    LOGOUT: path(API.AUTH, API_SUB.AUTH_LOGOUT),
    ME: path(API.AUTH, API_SUB.AUTH_ME),
    SETUP: path(API.AUTH, API_SUB.AUTH_SETUP),
    CONFIG: path(API.AUTH, API_SUB.AUTH_CONFIG),
    PASSKEY_LOGIN_OPTIONS: path(API.AUTH, API_SUB.AUTH_PASSKEY_LOGIN_OPTIONS),
    PASSKEY_LOGIN_VERIFY: path(API.AUTH, API_SUB.AUTH_PASSKEY_LOGIN_VERIFY),
    PASSKEY_REGISTER_OPTIONS: path(API.AUTH, API_SUB.AUTH_PASSKEY_REGISTER_OPTIONS),
    PASSKEY_REGISTER_VERIFY: path(API.AUTH, API_SUB.AUTH_PASSKEY_REGISTER_VERIFY),
    PASSKEYS: path(API.AUTH, API_SUB.AUTH_PASSKEYS),
    PASSKEY_BY_ID: (uuid: string) => pathId(API.AUTH, API_SUB.AUTH_PASSKEY_BY_ID, uuid),
  },
  PROVIDERS: {
    ROOT: path(API.PROVIDERS),
    BY_ID: (uuid: string) => pathId(API.PROVIDERS, API_SUB.BY_ID, uuid),
    SYNC_ALL: path(API.PROVIDERS, API_SUB.PROVIDER_SYNC_ALL),
    SYNC: (uuid: string) => pathId(API.PROVIDERS, API_SUB.PROVIDER_SYNC, uuid),
    SYNC_RUNS: (uuid: string) => pathId(API.PROVIDERS, API_SUB.PROVIDER_SYNC_RUNS, uuid),
    BALANCE_HISTORY: (uuid: string) =>
      pathId(API.PROVIDERS, API_SUB.PROVIDER_BALANCE_HISTORY, uuid),
    NETCUP_DEVICE_START: path(API.PROVIDERS, API_SUB.PROVIDER_NETCUP_DEVICE_START),
    NETCUP_DEVICE_POLL: path(API.PROVIDERS, API_SUB.PROVIDER_NETCUP_DEVICE_POLL),
    YANDEX_DISCOVER: path(API.PROVIDERS, API_SUB.PROVIDER_YANDEX_DISCOVER),
  },
  PROJECTS: {
    ROOT: path(API.PROJECTS),
    BY_ID: (uuid: string) => pathId(API.PROJECTS, API_SUB.BY_ID, uuid),
    MOVE_ALL: (uuid: string) => pathId(API.PROJECTS, API_SUB.PROJECT_MOVE_ALL, uuid),
    EMPTY: (uuid: string) => pathId(API.PROJECTS, API_SUB.PROJECT_EMPTY, uuid),
    STATS: (uuid: string) => pathId(API.PROJECTS, API_SUB.PROJECT_STATS, uuid),
  },
  SERVICES: {
    ROOT: path(API.SERVICES),
    BY_ID: (uuid: string) => pathId(API.SERVICES, API_SUB.BY_ID, uuid),
  },
  PAYMENTS: {
    ROOT: path(API.PAYMENTS),
    BY_ID: (uuid: string) => pathId(API.PAYMENTS, API_SUB.BY_ID, uuid),
  },
  ANALYTICS: {
    SUMMARY: path(API.ANALYTICS, API_SUB.ANALYTICS_SUMMARY),
    FORECAST: path(API.ANALYTICS, API_SUB.ANALYTICS_FORECAST),
  },
  RATES: {
    ROOT: path(API.RATES),
    REFRESH: path(API.RATES, API_SUB.RATES_REFRESH),
  },
  SETTINGS: path(API.SETTINGS),
  NOTIFICATIONS: {
    CHECK: path(API.NOTIFICATIONS, API_SUB.NOTIFICATIONS_CHECK),
    TEST: path(API.NOTIFICATIONS, API_SUB.NOTIFICATIONS_TEST),
  },
  TOKENS: {
    ROOT: path(API.TOKENS),
    BY_ID: (uuid: string) => pathId(API.TOKENS, API_SUB.BY_ID, uuid),
  },
} as const;
