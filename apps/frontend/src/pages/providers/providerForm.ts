import type { TFunction } from 'i18next';

// Union of every connector's credential fields flattened into one flat form shape. The modal
// shows only the subset relevant to the selected kind, the backend picks what it needs.
export interface FormValues {
  name: string;
  kind: string;
  token: string;
  loginUrl: string;
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
  yandex: 'https://console.yandex.cloud',
};

export const EMPTY_FORM: FormValues = {
  name: '',
  kind: 'manual',
  token: '',
  loginUrl: '',
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

// Per-kind required-credential check. Caller runs this only on create (edits allow blank fields,
// which mean "keep the stored credential"). Returns the error message to show, or null when ok.
export function validateProviderCredentials(v: FormValues, t: TFunction): string | null {
  if ((v.kind === 'hostbill' || v.kind === 'billmgr') && !(v.baseUrl && v.username && v.password))
    return t('providers.err.hostbillCreds');
  if (v.kind === 'selectel' && !(v.accountId && v.username && v.password))
    return t('providers.err.selectelCreds');
  if (v.kind === '4vps' && !v.token) return t('providers.err.vps4Token');
  if (v.kind === 'netcup' && !v.token) return t('providers.err.netcupToken');
  if (v.kind === 'beget' && !(v.username && v.password)) return t('providers.err.begetCreds');
  if (v.kind === 'vultr' && !v.token) return t('providers.err.vultrToken');
  if (v.kind === 'porkbun' && !(v.token && v.secretKey)) return t('providers.err.porkbunCreds');
  if (v.kind === 'linode' && !v.token) return t('providers.err.linodeToken');
  if (v.kind === 'aeza' && !v.token) return t('providers.err.aezaToken');
  if (v.kind === 'vdsina' && !v.token) return t('providers.err.vdsinaToken');
  if (v.kind === 'cloudflare' && !(v.accountId && v.token))
    return t('providers.err.cloudflareCreds');
  if (v.kind === 'stormwall' && !v.token) return t('providers.err.stormwallToken');
  if (v.kind === 'yandex' && !v.token) return t('providers.err.yandexKey');
  return null;
}

// Spread every credential field with blanks omitted, so an empty field on edit keeps the stored
// value (the backend only overwrites credentials it actually receives).
export function buildCredentials(v: FormValues) {
  return {
    token: v.token || undefined,
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
