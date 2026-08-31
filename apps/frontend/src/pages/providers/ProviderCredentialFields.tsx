import {
  type Icon,
  IconChevronDown,
  IconCircles,
  IconCrown,
  IconDeviceMobile,
  IconExternalLink,
  IconGridDots,
  IconKey,
  IconLock,
  IconMail,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { Fragment, type ReactNode, useCallback, useRef } from 'react';
import type { ProviderCredentialsReveal, YandexDiscover } from '@infra/shared';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { revealProviderCredentials, type SecretField, useYandexDiscover } from '@/api/providers';
import { NetcupAuthorizeButton } from '@/components/NetcupAuthorizeButton';
import { SecretInput } from '@/components/SecretInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { notifyError } from '@/utils/notify';
import type { StoredSecretFlags } from './ProviderFormFields';
import { AEZA_DEFAULT_BASE_URL, aezaBranchOrigin, type FormValues } from './providerForm';

interface ProviderCredentialFieldsProps {
  form: UseFormReturn<FormValues>;
  providerUuid?: string;
  storedSecrets?: StoredSecretFlags;
}

function SecretFormField({
  form,
  name,
  id,
  hasStored,
  reveal,
  placeholder,
  multiline,
}: {
  form: UseFormReturn<FormValues>;
  name: SecretField;
  id: string;
  hasStored?: boolean;
  reveal: (field: SecretField) => Promise<string>;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <SecretInput
          id={id}
          value={field.value}
          onChange={field.onChange}
          hasStored={hasStored}
          onReveal={hasStored ? () => reveal(name) : undefined}
          placeholder={placeholder}
          multiline={multiline}
        />
      )}
    />
  );
}

/** Field wrapper: label plus an optional description and credential deep link above the input. */
function Field({
  id,
  label,
  description,
  link,
  children,
}: {
  id: string;
  label: string;
  description?: ReactNode;
  link?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {(description || link) && (
        <div className="text-xs text-muted-foreground">
          {description}
          {typeof description === 'string' && link && ' — '}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-brand underline-offset-4 hover:underline"
            >
              {link.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
              <IconExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// Render a Yandex setup step, turning the "center.yandex.cloud" mention into a link. Steps without
// it are returned unchanged.
function linkifyCenter(text: string): ReactNode {
  const marker = 'center.yandex.cloud';
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a
        href="https://center.yandex.cloud"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-4 hover:no-underline"
      >
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

// Yandex Console UI labels quoted in the setup steps, styled to look like the real controls: blue
// primary buttons for actions, a leading icon for the few recognizable menu entries. Keyed by the
// exact English label (the console is English regardless of the app locale).
const YA_PRIMARY = new Set([
  'Create service account',
  'Create',
  'Create new key',
  'Assign roles',
  'Save',
]);
// Solid dark-grey buttons (filled with what is just an outline elsewhere).
const YA_FILLED = new Set(['Add role', 'Create authorized key']);
// Grey-blue role chips (no border), like a selected tag on the site.
const YA_CHIP = new Set(['viewer', 'billing.accounts.viewer']);
// Left-column category headers in the "All services" menu, each with its own gradient on the site.
const YA_SECTION: Record<string, string> = {
  'Monitoring & Resources': 'bg-gradient-to-r from-slate-600 to-slate-800 text-white',
  Billing: 'bg-gradient-to-br from-[#2f4d7a] to-[#22395d] text-white',
};
const YA_ICON: Record<string, Icon> = {
  'All services': IconGridDots,
  'Identity and Access Management': IconKey,
  'Service accounts': IconRobot,
  'Add role': IconPlus,
};

// The classes that make a quoted label look like its real Console control.
function tokenClass(label: string): string {
  if (YA_PRIMARY.has(label)) return 'bg-gradient-to-b from-[#4a86bd] to-[#3c72a4] text-white';
  if (YA_FILLED.has(label)) return 'bg-[#3a3a3e] text-white';
  if (YA_CHIP.has(label)) return 'bg-[#4b5666] text-[#cdd5e0]';
  const section = YA_SECTION[label];
  if (section) return section;
  return 'bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

// Render one quoted Console label as a badge that mimics its on-site look.
function YaToken({ label }: { label: string }) {
  const LabelIcon = YA_ICON[label];
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        tokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" />}
      {label}
    </span>
  );
}

// Turn a setup step into React nodes: each "quoted" Console label becomes a YaToken badge, and the
// plain text between them keeps the center.yandex.cloud link.
function renderYaStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={key++}>{linkifyCenter(text.slice(last, m.index))}</Fragment>);
    }
    parts.push(<YaToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyCenter(text.slice(last))}</Fragment>);
  }
  return parts;
}

// Timeweb Cloud panel labels (RU/EN). Sidebar section vs primary action buttons.
const TW_SECTION = new Set(['API и Terraform', 'API and Terraform']);
const TW_PRIMARY = new Set(['Добавить токен', 'Выпустить', 'Add token', 'Issue']);
const TW_ICON: Record<string, Icon> = {
  'API и Terraform': IconCircles,
  'API and Terraform': IconCircles,
};

function twTokenClass(label: string): string {
  if (TW_PRIMARY.has(label)) return 'rounded-full bg-[#5c5de0] text-white';
  if (TW_SECTION.has(label)) return 'rounded-md bg-[#282e38] text-white';
  return 'rounded-md bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

function TwToken({ label }: { label: string }) {
  const LabelIcon = TW_ICON[label];
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        twTokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" />}
      {label}
    </span>
  );
}

function renderTwStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    }
    parts.push(<TwToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }
  return parts;
}

// Hetzner Cloud console labels (EN/RU). Active tabs (red + underline), sidebar rows, primary buttons.
const HZ_TAB = new Set(['Projects', 'API Tokens', 'Проекты', 'API-токены']);
const HZ_NAV = new Set(['Default', 'Security', 'Безопасность']);
const HZ_PRIMARY = new Set(['Generate API Token', 'Создать API-токен']);
const HZ_ICON: Record<string, Icon> = {
  Default: IconCrown,
  Security: IconKey,
  Безопасность: IconKey,
};

function linkifyHetzner(text: string): ReactNode {
  const marker = 'console.hetzner.com';
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a
        href="https://console.hetzner.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-4 hover:no-underline"
      >
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

function hzTokenClass(label: string): string {
  if (HZ_PRIMARY.has(label)) return 'rounded-md bg-[#a01f2a] text-white';
  if (HZ_TAB.has(label)) return 'rounded-md bg-[#1a1a1a] text-[#ff5a68]';
  if (HZ_NAV.has(label)) return 'rounded-md bg-[#252525] text-white';
  return 'rounded-md bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

function HzToken({ label }: { label: string }) {
  const LabelIcon = HZ_ICON[label];
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        hzTokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" />}
      {label}
    </span>
  );
}

function renderHzStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={key++}>{linkifyHetzner(text.slice(last, m.index))}</Fragment>);
    }
    parts.push(<HzToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyHetzner(text.slice(last))}</Fragment>);
  }
  return parts;
}

const HK_USER_MENU = new Set(['Username', 'Пользователь']);
const HK_LINK = new Set(['API keys', 'API ключи', 'API-ключи']);
const HK_SOFT = new Set(['Add key', 'Create', 'OK', 'Добавить ключ', 'Создать', 'ОК']);
const HK_ICON: Record<string, Icon> = {
  'Add key': IconPlus,
  'Добавить ключ': IconPlus,
};

function linkifyHostkey(text: string): ReactNode {
  const marker = 'invapi.hostkey.ru';
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a
        href="https://invapi.hostkey.ru"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-4 hover:no-underline"
      >
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

function hkTokenClass(label: string): string {
  if (HK_LINK.has(label))
    return 'rounded-md bg-white px-1.5 font-semibold text-[#8369c4] ring-1 ring-black/5 ring-inset';
  if (HK_SOFT.has(label)) return 'rounded-md bg-[#f2ebfa] text-[#8369c4]';
  return 'rounded-md bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

function HkToken({ label }: { label: string }) {
  if (HK_USER_MENU.has(label)) {
    return (
      <span className="mx-0.5 inline-flex items-center gap-1.5 rounded-md bg-[#f0f2f5] px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap text-[#1a1a1a]">
        <span className="inline-flex size-4 items-center justify-center rounded-[5px] bg-[#e4e6eb]">
          <IconUser className="size-2.5 shrink-0 text-[#3a3a3a]" stroke={1.75} />
        </span>
        <span>{label}</span>
        <IconChevronDown className="size-2.5 shrink-0 text-[#3a3a3a]" stroke={2} />
      </span>
    );
  }
  const LabelIcon = HK_ICON[label];
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        hkTokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" />}
      {label}
    </span>
  );
}

function renderHkStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={key++}>{linkifyHostkey(text.slice(last, m.index))}</Fragment>);
    }
    parts.push(<HkToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyHostkey(text.slice(last))}</Fragment>);
  }
  return parts;
}

const DS_NAV = new Set(['Profile', 'Authenticator app']);
const DS_SECTION = new Set(['BACKUP LOGIN VIA EMAIL']);
const DS_PRIMARY = new Set(['Attach email', 'Confirm']);
const DS_OUTLINE = new Set(['Connect']);
const DS_ICON: Record<string, Icon> = {
  Profile: IconUser,
  'BACKUP LOGIN VIA EMAIL': IconMail,
  'Authenticator app': IconDeviceMobile,
};

function linkifyDoubleServers(text: string): ReactNode {
  const marker = 'doubleservers.com';
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a
        href="https://doubleservers.com/dashboard/profile"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-4 hover:no-underline"
      >
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

function dsTokenClass(label: string): string {
  if (DS_PRIMARY.has(label)) return 'rounded-full bg-white text-black';
  if (DS_OUTLINE.has(label))
    return 'rounded-full bg-[#141414] text-[#c8c8c8] ring-1 ring-[#3a3a3a] ring-inset';
  if (DS_SECTION.has(label))
    return 'rounded-md bg-[#141414] text-[#c8c8c8] ring-1 ring-[#3a3a3a] ring-inset';
  if (DS_NAV.has(label))
    return 'rounded-md bg-[#141414] text-white ring-1 ring-[#3a3a3a] ring-inset';
  return 'rounded-md bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

function DsToken({ label }: { label: string }) {
  const LabelIcon = DS_ICON[label];
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        dsTokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" />}
      {label}
    </span>
  );
}

function renderDsStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(
        <Fragment key={key++}>{linkifyDoubleServers(text.slice(last, m.index))}</Fragment>,
      );
    }
    parts.push(<DsToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyDoubleServers(text.slice(last))}</Fragment>);
  }
  return parts;
}

// OpenRouter console chips (dark UI): muted Home nav, lime Management Keys row, green New Key CTA,
// outlined Create.
const OR_NAV = new Set(['Home']);
const OR_SECTION = new Set(['Management Keys']);
const OR_PRIMARY = new Set(['New Key', '+ New Key']);
const OR_CREATE = new Set(['Create']);
const OR_ICON: Record<string, Icon> = {
  'Management Keys': IconLock,
  'New Key': IconPlus,
  '+ New Key': IconPlus,
};

function linkifyOpenRouter(text: string): ReactNode {
  const marker = 'openrouter.ai';
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a
        href="https://openrouter.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline underline-offset-4 hover:no-underline"
      >
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

function orTokenClass(label: string): string {
  if (OR_PRIMARY.has(label)) return 'rounded-md bg-[#c8f135] text-black';
  if (OR_SECTION.has(label))
    return 'rounded-md bg-[#c8f135]/12 text-[#c8f135] ring-1 ring-[#c8f135]/35 ring-inset';
  if (OR_CREATE.has(label))
    return 'rounded-md bg-[#141414] text-white ring-1 ring-[#3a3a3a] ring-inset';
  if (OR_NAV.has(label))
    return 'rounded-md bg-white/[0.07] text-[#a1a1a1] ring-1 ring-white/15 ring-inset';
  return 'rounded-md bg-white/[0.07] text-foreground ring-1 ring-white/10 ring-inset';
}

function OrToken({ label }: { label: string }) {
  const LabelIcon = OR_ICON[label];
  const text = label === '+ New Key' ? 'New Key' : label;
  return (
    <span
      className={cn(
        'mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[0.8em] font-medium leading-none whitespace-nowrap',
        orTokenClass(label),
      )}
    >
      {LabelIcon && <LabelIcon className="size-3 shrink-0" stroke={2} />}
      {text}
    </span>
  );
}

function renderOrStep(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(<Fragment key={key++}>{linkifyOpenRouter(text.slice(last, m.index))}</Fragment>);
    }
    parts.push(<OrToken key={key++} label={m[1]} />);
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyOpenRouter(text.slice(last))}</Fragment>);
  }
  return parts;
}

// A pasted Yandex authorized key is only worth a discovery call once it parses into the fields the
// backend signs the JWT with. Guards against firing on every keystroke of a half-pasted key.
function isCompleteYandexKey(raw: string): boolean {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Boolean(o.id && o.service_account_id && o.private_key);
  } catch {
    return false;
  }
}

export function ProviderCredentialFields({
  form,
  providerUuid,
  storedSecrets,
}: ProviderCredentialFieldsProps) {
  const { t } = useTranslation();
  const kind = form.watch('kind');
  const optionalPh = t('common.optional');
  const revealCache = useRef<{ uuid: string; data: ProviderCredentialsReveal } | null>(null);
  const reveal = useCallback(
    async (field: SecretField) => {
      if (!providerUuid) return '';
      if (!revealCache.current || revealCache.current.uuid !== providerUuid) {
        try {
          revealCache.current = {
            uuid: providerUuid,
            data: await revealProviderCredentials(providerUuid),
          };
        } catch (e) {
          notifyError(apiErrorMessage(e));
          throw e;
        }
      }
      return revealCache.current.data[field] ?? '';
    },
    [providerUuid],
  );

  const baseUrl = form.watch('baseUrl');
  const yandexToken = form.watch('token');
  const yandexBody: YandexDiscover | null =
    kind !== 'yandex'
      ? null
      : yandexToken && isCompleteYandexKey(yandexToken)
        ? { token: yandexToken }
        : !yandexToken && providerUuid
          ? { providerUuid }
          : null;
  const discover = useYandexDiscover(yandexBody);
  const yandexScope = discover.data ?? null;

  if (kind === 'selectel') {
    return (
      <>
        <Field
          id="cred-account-id"
          label={t('providers.field.accountId')}
          description={t('providers.field.accountIdDesc')}
        >
          <Input id="cred-account-id" placeholder="123456" {...form.register('accountId')} />
        </Field>
        <Field
          id="cred-username"
          label={t('providers.field.serviceUsername')}
          description={t('providers.field.serviceUsernameDesc')}
        >
          <Input id="cred-username" {...form.register('username')} />
        </Field>
        <Field id="cred-password" label={t('providers.field.password')}>
          <SecretFormField
            form={form}
            name="password"
            id="cred-password"
            hasStored={storedSecrets?.hasPassword}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-project"
          label={t('providers.field.project')}
          description={t('providers.field.projectDesc')}
        >
          <Input id="cred-project" placeholder="my-project" {...form.register('projectName')} />
        </Field>
      </>
    );
  }

  if (kind === 'cloudflare') {
    return (
      <>
        <Field
          id="cred-account-id"
          label={t('providers.field.accountId')}
          description={t('providers.field.cloudflareAccountIdDesc')}
        >
          <Input id="cred-account-id" {...form.register('accountId')} />
        </Field>
        <Field
          id="cred-token"
          label={t('providers.field.apiToken')}
          description={t('providers.field.apiTokenDescCloudflare')}
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
      </>
    );
  }

  if (kind === 'hostbill' || kind === 'billmgr') {
    return (
      <>
        <Field id="cred-base-url" label={t('providers.field.apiBaseUrl')}>
          <Input
            id="cred-base-url"
            placeholder={
              kind === 'billmgr' ? 'https://my.akenai.host/billmgr' : 'https://secure.veesp.com/api'
            }
            {...form.register('baseUrl')}
          />
        </Field>
        <Field id="cred-username" label={t('providers.field.loginEmail')}>
          <Input id="cred-username" {...form.register('username')} />
        </Field>
        <Field id="cred-password" label={t('providers.field.password')}>
          <SecretFormField
            form={form}
            name="password"
            id="cred-password"
            hasStored={storedSecrets?.hasPassword}
            reveal={reveal}
          />
        </Field>
        {(kind === 'billmgr' || kind === 'hostbill') && (
          <Field
            id="cred-totp"
            label={t('providers.field.totpSecret')}
            description={t('providers.field.totpSecretDesc')}
          >
            <SecretFormField
              form={form}
              name="totpSecret"
              id="cred-totp"
              hasStored={storedSecrets?.hasTotpSecret}
              reveal={reveal}
              placeholder={storedSecrets?.hasTotpSecret ? undefined : optionalPh}
            />
          </Field>
        )}
      </>
    );
  }

  if (kind === '4vps') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.apiToken')}
          description={t('providers.field.apiTokenDesc4vps')}
          link="https://4vps.su/dashboard/api"
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-panel-id"
          label={t('providers.field.panelId')}
          description={t('providers.field.panelIdDesc')}
        >
          <Input id="cred-panel-id" placeholder="1" {...form.register('panelId')} />
        </Field>
      </>
    );
  }

  if (kind === 'netcup') {
    return (
      <>
        <NetcupAuthorizeButton
          onToken={(tok) => form.setValue('token', tok, { shouldDirty: true })}
        />
        <Field
          id="cred-token"
          label={t('providers.field.refreshToken')}
          description={t('providers.field.refreshTokenDescNetcup')}
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
      </>
    );
  }

  if (kind === 'netlen') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescNetlen')}
        link="https://www.netlen.com.tr/panel/api"
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'vultr') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescVultr')}
        link="https://console.vultr.com/user/apiaccess/"
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'linode') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescLinode')}
        link="https://cloud.linode.com/profile/tokens"
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'aeza') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.apiToken')}
          description={t('providers.field.apiTokenDescAeza')}
          // Keys are per-branch — point at the panel the chosen base URL belongs to.
          link={`${aezaBranchOrigin(baseUrl)}/settings/apikeys`}
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-base-url"
          label={t('providers.field.apiBaseUrl')}
          description={t('providers.field.apiBaseUrlDescAeza')}
        >
          <Input
            id="cred-base-url"
            placeholder={AEZA_DEFAULT_BASE_URL}
            {...form.register('baseUrl')}
          />
        </Field>
      </>
    );
  }

  if (kind === 'hostkey') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={
          <div className="text-sm leading-7">
            {renderHkStep(t('providers.field.apiTokenDescHostkey'))}
          </div>
        }
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'stormwall') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescStormwall')}
        link="https://users.stormwall.pro/tokens"
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'openrouter') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.managementKey')}
          description={
            <div className="text-sm leading-7">
              {renderOrStep(t('providers.field.apiTokenDescOpenrouter'))}
            </div>
          }
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Controller
          control={form.control}
          name="useCatalogNames"
          render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox
                id="or-catalog-names"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="or-catalog-names">{t('providers.field.useCatalogNames')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('providers.field.useCatalogNamesDesc')}
                </p>
              </div>
            </div>
          )}
        />
      </>
    );
  }

  if (kind === 'vdsina') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.apiToken')}
          description={t('providers.field.apiTokenDescVdsina')}
          link="https://cp.vdsina.ru/user/list"
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-base-url"
          label={t('providers.field.apiBaseUrl')}
          description={t('providers.field.apiBaseUrlDescVdsina')}
        >
          <Input
            id="cred-base-url"
            placeholder="https://userapi.vdsina.ru"
            {...form.register('baseUrl')}
          />
        </Field>
      </>
    );
  }

  if (kind === 'beget') {
    return (
      <>
        <Field
          id="cred-username"
          label={t('providers.field.begetLogin')}
          description={t('providers.field.begetLoginDesc')}
        >
          <Input id="cred-username" {...form.register('username')} />
        </Field>
        <Field id="cred-password" label={t('providers.field.password')}>
          <SecretFormField
            form={form}
            name="password"
            id="cred-password"
            hasStored={storedSecrets?.hasPassword}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-totp"
          label={t('providers.field.totpSecret')}
          description={t('providers.field.totpSecretDesc')}
        >
          <SecretFormField
            form={form}
            name="totpSecret"
            id="cred-totp"
            hasStored={storedSecrets?.hasTotpSecret}
            reveal={reveal}
            placeholder={storedSecrets?.hasTotpSecret ? undefined : optionalPh}
          />
        </Field>
        <Field
          id="cred-api-password"
          label={t('providers.field.begetApiPassword')}
          description={t('providers.field.begetApiPasswordDesc')}
          link="https://cp.beget.com/settings/security/api"
        >
          <SecretFormField
            form={form}
            name="apiPassword"
            id="cred-api-password"
            hasStored={storedSecrets?.hasApiPassword}
            reveal={reveal}
            placeholder={storedSecrets?.hasApiPassword ? undefined : optionalPh}
          />
        </Field>
      </>
    );
  }

  if (kind === 'doubleservers') {
    return (
      <>
        <Field
          id="cred-username"
          label={t('providers.field.loginEmail')}
          description={
            <div className="space-y-1.5 text-sm leading-7">
              <p>{renderDsStep(t('providers.field.doubleserversSetupStep1'))}</p>
              <p>{renderDsStep(t('providers.field.doubleserversSetupStep2'))}</p>
            </div>
          }
        >
          <Input id="cred-username" {...form.register('username')} />
        </Field>
        <Field id="cred-password" label={t('providers.field.password')}>
          <SecretFormField
            form={form}
            name="password"
            id="cred-password"
            hasStored={storedSecrets?.hasPassword}
            reveal={reveal}
          />
        </Field>
        <Field
          id="cred-totp"
          label={t('providers.field.totpSecret')}
          description={
            <div className="text-sm leading-7">
              {renderDsStep(t('providers.field.doubleserversSetupStep3'))}
            </div>
          }
        >
          <SecretFormField
            form={form}
            name="totpSecret"
            id="cred-totp"
            hasStored={storedSecrets?.hasTotpSecret}
            reveal={reveal}
            placeholder={storedSecrets?.hasTotpSecret ? undefined : optionalPh}
          />
        </Field>
      </>
    );
  }

  if (kind === 'porkbun') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.porkbunApiKey')}
          description={t('providers.field.porkbunApiKeyDesc')}
          link="https://porkbun.com/account/api"
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Field id="cred-secret-key" label={t('providers.field.porkbunSecretKey')}>
          <SecretFormField
            form={form}
            name="secretKey"
            id="cred-secret-key"
            hasStored={storedSecrets?.hasSecretKey}
            reveal={reveal}
          />
        </Field>
      </>
    );
  }

  if (kind === 'spaceship') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.spaceshipApiKey')}
          description={t('providers.field.spaceshipApiKeyDesc')}
          link="https://www.spaceship.com/application/api-manager/"
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
          />
        </Field>
        <Field id="cred-secret-key" label={t('providers.field.spaceshipApiSecret')}>
          <SecretFormField
            form={form}
            name="secretKey"
            id="cred-secret-key"
            hasStored={storedSecrets?.hasSecretKey}
            reveal={reveal}
          />
        </Field>
      </>
    );
  }

  if (kind === 'yandex') {
    return (
      <>
        <Field
          id="cred-token"
          label={t('providers.field.yandexKey')}
          description={
            <>
              <span className="font-medium">{t('providers.field.yandexKeySetup')}</span>
              <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-sm leading-7">
                <li>{renderYaStep(t('providers.field.yandexKeyStep1'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep2'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep3'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep4'))}</li>
              </ol>
            </>
          }
        >
          <SecretFormField
            form={form}
            name="token"
            id="cred-token"
            hasStored={storedSecrets?.hasToken}
            reveal={reveal}
            multiline
            placeholder={
              storedSecrets?.hasToken
                ? undefined
                : '{\n  "id": "...",\n  "service_account_id": "...",\n  "key_algorithm": "...",\n  "public_key": "...",\n  "private_key": "..."\n}'
            }
          />
        </Field>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('providers.field.yandexScope')}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={discover.isFetching || !yandexBody}
              onClick={() => discover.refetch()}
            >
              <IconRefresh className={discover.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              {t('providers.field.yandexScopeRefresh')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('providers.field.yandexScopeDesc')}</p>
          {discover.isError ? (
            <p className="text-xs text-destructive">{apiErrorMessage(discover.error)}</p>
          ) : yandexScope ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('providers.field.yandexScopeFolders')}
                </p>
                {yandexScope.folders.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {yandexScope.folders.map((f) => (
                      <Badge key={f.id} variant="secondary" className="font-mono">
                        {f.id}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('providers.field.yandexScopeNone')}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('providers.field.yandexScopeBilling')}
                </p>
                {yandexScope.billingAccount ? (
                  <Badge variant="secondary" className="font-mono">
                    {yandexScope.billingAccount.id}
                  </Badge>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('providers.field.yandexScopeNone')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {discover.isFetching
                ? t('providers.field.yandexScopeLoading')
                : t('providers.field.yandexScopePending')}
            </p>
          )}
        </div>
      </>
    );
  }

  if (kind === 'hetzner') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={
          <div className="text-sm leading-7">
            {renderHzStep(t('providers.field.apiTokenDescHetzner'))}
          </div>
        }
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'timeweb') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={
          <div className="leading-7">
            <p>{renderTwStep(t('providers.field.apiTokenDescTimeweb'))}</p>
            <a
              href="https://timeweb.cloud/my/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-brand underline-offset-4 hover:underline"
            >
              timeweb.cloud/my/api-keys
              <IconExternalLink className="size-3" />
            </a>
          </div>
        }
      >
        <SecretFormField
          form={form}
          name="token"
          id="cred-token"
          hasStored={storedSecrets?.hasToken}
          reveal={reveal}
        />
      </Field>
    );
  }

  if (kind === 'manual') return null;

  return (
    <Field id="cred-token" label={t('providers.field.apiToken')}>
      <SecretFormField
        form={form}
        name="token"
        id="cred-token"
        hasStored={storedSecrets?.hasToken}
        reveal={reveal}
      />
    </Field>
  );
}
