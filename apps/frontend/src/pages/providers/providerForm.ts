import type { TFunction } from 'i18next';

// Union of every connector's credential fields flattened into one flat form shape. The modal
// shows only the subset relevant to the selected kind, the backend picks what it needs.
export interface FormValues {
  name: string;
  kind: string;
  token: string;
  loginUrl: string;
  iconName: string;
  iconBg: string;
  baseUrl: string;
  username: string;
  password: string;
  totpSecret: string;
  accountId: string;
  projectName: string;
  panelId: string;
  apiPassword: string;
  secretKey: string;
  isPostpaid: boolean;
}

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
  vibehost: 'https://vibehost.net',
  vdsina: 'https://cp.vdsina.ru',
  cloudflare: 'https://dash.cloudflare.com',
  porkbun: 'https://porkbun.com/account',
  yandex: 'https://console.yandex.cloud',
  doubleservers: 'https://doubleservers.com/dashboard',
};

export const EMPTY_FORM: FormValues = {
  name: '',
  kind: 'manual',
  token: '',
  loginUrl: '',
  iconName: '',
  iconBg: '',
  baseUrl: '',
  username: '',
  password: '',
  totpSecret: '',
  accountId: '',
  projectName: '',
  panelId: '',
  apiPassword: '',
  secretKey: '',
  isPostpaid: false,
};

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

// Per-kind required-credential check. Caller runs this only on create (edits allow blank fields,
// which mean "keep the stored credential"). Returns the error message to show, or null when ok.
export function validateProviderCredentials(
  v: FormValues,
  t: TFunction,
  opts?: { requireCreds?: boolean },
): string | null {
  const requireCreds = opts?.requireCreds ?? true;
  if (
    requireCreds &&
    (v.kind === 'hostbill' || v.kind === 'billmgr') &&
    !(v.baseUrl && v.username && v.password)
  )
    return t('providers.err.hostbillCreds');
  if (requireCreds && v.kind === 'selectel' && !(v.accountId && v.username && v.password))
    return t('providers.err.selectelCreds');
  if (requireCreds && v.kind === '4vps' && !v.token) return t('providers.err.vps4Token');
  if (requireCreds && v.kind === 'netcup' && !v.token) return t('providers.err.netcupToken');
  if (requireCreds && v.kind === 'beget' && !(v.username && v.password))
    return t('providers.err.begetCreds');
  if (requireCreds && v.kind === 'doubleservers' && !(v.username && v.password))
    return t('providers.err.doubleserversCreds');
  if (requireCreds && v.kind === 'vultr' && !v.token) return t('providers.err.vultrToken');
  if (requireCreds && v.kind === 'porkbun' && !(v.token && v.secretKey))
    return t('providers.err.porkbunCreds');
  if (requireCreds && v.kind === 'linode' && !v.token) return t('providers.err.linodeToken');
  if (requireCreds && v.kind === 'aeza' && !v.token) return t('providers.err.aezaToken');
  if (requireCreds && v.kind === 'vibehost' && !v.token) return t('providers.err.vibehostToken');
  if (v.kind === 'hostkey') {
    if (requireCreds && !v.token) return t('providers.err.hostkeyToken');
    if (v.token && !HOSTKEY_API_KEY_RE.test(normalizeHostkeyToken(v.token)))
      return t('providers.err.hostkeyTokenFormat');
  }
  if (requireCreds && v.kind === 'vdsina' && !v.token) return t('providers.err.vdsinaToken');
  if (requireCreds && v.kind === 'cloudflare' && !(v.accountId && v.token))
    return t('providers.err.cloudflareCreds');
  if (requireCreds && v.kind === 'stormwall' && !v.token) return t('providers.err.stormwallToken');
  if (requireCreds && v.kind === 'yandex' && !v.token) return t('providers.err.yandexKey');
  return null;
}

// Spread every credential field with blanks omitted, so an empty field on edit keeps the stored
// value (the backend only overwrites credentials it actually receives).
export function buildCredentials(v: FormValues) {
  const token =
    v.kind === 'hostkey' && v.token ? normalizeHostkeyToken(v.token) : v.token || undefined;
  return {
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
}
