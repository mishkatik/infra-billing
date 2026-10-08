import type { Provider, ProviderAccount } from '@infra/shared';
import type { TFunction } from 'i18next';

/** The hoster identity: what the provider row itself stores. */
export interface IdentityFormValues {
  name: string;
  kind: string;
  loginUrl: string;
  iconName: string;
  iconBg: string;
}

// One account's settings plus every connector's credential fields flattened into one shape. The
// form shows only the subset relevant to the provider kind, the backend picks what it needs.
export interface AccountFormValues {
  label: string;
  isPostpaid: boolean;
  useCatalogNames: boolean;
  token: string;
  baseUrl: string;
  username: string;
  password: string;
  totpSecret: string;
  accountId: string;
  projectName: string;
  panelId: string;
  apiPassword: string;
  secretKey: string;
}

/** Which stored secrets an account already has (drives the masked inputs and reveal buttons). */
export type StoredSecretFlags = Pick<
  ProviderAccount,
  'hasToken' | 'hasPassword' | 'hasTotpSecret' | 'hasApiPassword' | 'hasSecretKey'
>;

// Well-known cabinet URLs per connector kind, pre-filled into loginUrl on create so the owner
// doesn't retype them (they also drive the provider favicon). hostbill/billmgr are self-hosted
// installs and manual has no panel — no default for those. The field stays editable.
export const DEFAULT_LOGIN_URLS: Record<string, string> = {
  timeweb: 'https://timeweb.cloud/my',
  hetzner: 'https://console.hetzner.com',
  hostkey: 'https://invapi.hostkey.ru',
  netcup: 'https://www.customercontrolpanel.de',
  selectel: 'https://my.selectel.ru',
  '4vps': 'https://4vps.su/dashboard',
  netlen: 'https://www.netlen.com.tr/panel',
  beget: 'https://cp.beget.com',
  stormwall: 'https://users.stormwall.pro',
  vultr: 'https://console.vultr.com',
  linode: 'https://cloud.linode.com',
  aeza: 'https://my.aeza.net',
  vdsina: 'https://cp.vdsina.ru',
  cloudflare: 'https://dash.cloudflare.com',
  porkbun: 'https://porkbun.com/account',
  spaceship: 'https://www.spaceship.com/application/',
  yandex: 'https://console.yandex.cloud',
  doubleservers: 'https://doubleservers.com/dashboard',
  openrouter: 'https://openrouter.ai',
};

export const EMPTY_IDENTITY: IdentityFormValues = {
  name: '',
  kind: 'manual',
  loginUrl: '',
  iconName: '',
  iconBg: '',
};

export const EMPTY_ACCOUNT: AccountFormValues = {
  label: '',
  isPostpaid: false,
  useCatalogNames: true,
  token: '',
  baseUrl: '',
  username: '',
  password: '',
  totpSecret: '',
  accountId: '',
  projectName: '',
  panelId: '',
  apiPassword: '',
  secretKey: '',
};

export function identityFormFrom(p: Provider): IdentityFormValues {
  return {
    name: p.name,
    kind: p.kind,
    loginUrl: p.loginUrl ?? '',
    iconName: p.iconName ?? '',
    iconBg: p.iconBg ?? '',
  };
}

/** Non-secret fields are prefilled; secrets stay blank until revealed on demand. */
export function accountFormFrom(a: ProviderAccount): AccountFormValues {
  return {
    ...EMPTY_ACCOUNT,
    label: a.label ?? '',
    isPostpaid: a.isPostpaid,
    useCatalogNames: a.useCatalogNames !== false,
    baseUrl: a.baseUrl ?? '',
    username: a.username ?? '',
    accountId: a.accountId ?? '',
    projectName: a.projectName ?? '',
    panelId: a.panelId ?? '',
  };
}

/**
 * A new account of an existing provider starts with the API base URL of its newest account that has
 * one: logins at the same hoster share the panel host, only the credentials differ.
 */
export function newAccountForm(p: Provider): AccountFormValues {
  const baseUrl = p.accounts.filter((a) => a.baseUrl).at(-1)?.baseUrl ?? '';
  return { ...EMPTY_ACCOUNT, baseUrl };
}

// Aeza runs two independent branches on an identical API — international .net and Russian .ru.
// An API key belongs to exactly one of them, so the branch is part of the credentials.
export const AEZA_BASE_URLS = ['https://my.aeza.net', 'https://my.aeza.ru'];
export const AEZA_DEFAULT_BASE_URL = AEZA_BASE_URLS[0];

/** Branch the entered base URL points at (panel origin or full API URL), .net while it's blank. */
export function aezaBranchOrigin(raw: string | undefined): string {
  const origin = (raw ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v2$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return AEZA_BASE_URLS.includes(origin) ? origin : AEZA_DEFAULT_BASE_URL;
}

const HOSTKEY_API_KEY_RE = /^[a-f0-9]{16}-[a-f0-9]{16}$/i;

function normalizeHostkeyToken(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[.•・∙]/g, '-');
}

// Per-kind required-credential check. Required fields are enforced only for a new account (edits
// allow blank fields, which mean "keep the stored credential"). Returns the message or null.
export function validateAccountCredentials(
  kind: string,
  v: AccountFormValues,
  t: TFunction,
  opts?: { requireCreds?: boolean },
): string | null {
  const requireCreds = opts?.requireCreds ?? true;
  if (
    requireCreds &&
    (kind === 'hostbill' || kind === 'billmgr') &&
    !(v.baseUrl && v.username && v.password)
  )
    return t('providers.err.hostbillCreds');
  if (requireCreds && kind === 'selectel' && !(v.accountId && v.username && v.password))
    return t('providers.err.selectelCreds');
  if (requireCreds && kind === '4vps' && !v.token) return t('providers.err.vps4Token');
  if (requireCreds && kind === 'netcup' && !v.token) return t('providers.err.netcupToken');
  if (requireCreds && kind === 'beget' && !(v.username && v.password))
    return t('providers.err.begetCreds');
  if (requireCreds && kind === 'doubleservers' && !(v.username && v.password))
    return t('providers.err.doubleserversCreds');
  if (requireCreds && kind === 'vultr' && !v.token) return t('providers.err.vultrToken');
  if (requireCreds && kind === 'porkbun' && !(v.token && v.secretKey))
    return t('providers.err.porkbunCreds');
  if (requireCreds && kind === 'spaceship' && !(v.token && v.secretKey))
    return t('providers.err.spaceshipCreds');
  if (requireCreds && kind === 'linode' && !v.token) return t('providers.err.linodeToken');
  if (requireCreds && kind === 'aeza' && !v.token) return t('providers.err.aezaToken');
  if (kind === 'hostkey') {
    if (requireCreds && !v.token) return t('providers.err.hostkeyToken');
    if (v.token && !HOSTKEY_API_KEY_RE.test(normalizeHostkeyToken(v.token)))
      return t('providers.err.hostkeyTokenFormat');
  }
  if (requireCreds && kind === 'vdsina' && !v.token) return t('providers.err.vdsinaToken');
  if (requireCreds && kind === 'cloudflare' && !(v.accountId && v.token))
    return t('providers.err.cloudflareCreds');
  if (requireCreds && kind === 'stormwall' && !v.token) return t('providers.err.stormwallToken');
  if (requireCreds && kind === 'yandex' && !v.token) return t('providers.err.yandexKey');
  if (requireCreds && kind === 'openrouter' && !v.token) return t('providers.err.openrouterToken');
  return null;
}

// Spread every credential field with blanks omitted, so an empty field on edit keeps the stored
// value (the backend only overwrites credentials it actually receives).
export function buildCredentials(kind: string, v: AccountFormValues) {
  const token =
    kind === 'hostkey' && v.token ? normalizeHostkeyToken(v.token) : v.token || undefined;
  const base = {
    token: token || undefined,
    baseUrl: v.baseUrl || undefined,
    username: v.username || undefined,
    password: v.password || undefined,
    totpSecret: v.totpSecret || undefined,
    accountId: v.accountId || undefined,
    projectName: v.projectName || undefined,
    panelId: v.panelId || undefined,
    apiPassword: v.apiPassword || undefined,
    secretKey: v.secretKey || undefined,
  };
  if (kind === 'openrouter') {
    return {
      ...base,
      useCatalogNames: v.useCatalogNames,
    };
  }
  return base;
}

/**
 * Label rule for the account form: required unless the account may stay the unlabelled original,
 * and unique (case-insensitive) among the provider's other accounts. The backend checks it too.
 */
export function validateAccountLabel(
  label: string,
  t: TFunction,
  opts: { required: boolean; otherLabels: (string | null)[] },
): string | true {
  const value = label.trim();
  if (!value) return opts.required ? t('providers.account.labelRequired') : true;
  if (value.length > 64) return t('providers.account.labelTooLong');
  const lower = value.toLowerCase();
  if (opts.otherLabels.some((l) => l?.trim().toLowerCase() === lower))
    return t('providers.account.labelTaken');
  return true;
}
