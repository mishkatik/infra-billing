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
import { revealAccountCredentials, type SecretField, useYandexDiscover } from '@/api/providers';
import { NetcupAuthorizeButton } from '@/components/NetcupAuthorizeButton';
import { SecretInput } from '@/components/SecretInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyError } from '@/utils/notify';
import {
  AEZA_DEFAULT_BASE_URL,
  type AccountFormValues,
  aezaBranchOrigin,
  type StoredSecretFlags,
} from './providerForm';

interface ProviderCredentialFieldsProps {
  form: UseFormReturn<AccountFormValues>;
  kind: string;
  // Set when editing an existing account: enables reveal and Yandex discovery from stored keys.
  accountUuid?: string;
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
  form: UseFormReturn<AccountFormValues>;
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
              className="inline-flex items-center gap-0.5 text-slate underline-offset-2 hover:underline"
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

const LINK_CLASS = 'text-slate underline-offset-2 hover:underline';

interface ConsoleHost {
  marker: string;
  href: string;
}

// Turn the first mention of a provider's console host in a setup step into a link.
function linkifyHost(text: string, host?: ConsoleHost): ReactNode {
  if (!host) return text;
  const idx = text.indexOf(host.marker);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a href={host.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {host.marker}
      </a>
      {text.slice(idx + host.marker.length)}
    </>
  );
}

// A quoted console label ("Create", "API Tokens"…) as a plain ink chip, so the owner can spot the
// control to click without the help text imitating every provider's own colours.
function ConsoleChip({
  label,
  icon: LabelIcon,
  trailing: Trailing,
}: {
  label: string;
  icon?: Icon;
  trailing?: Icon;
}) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-px align-middle text-[0.9em] leading-snug whitespace-nowrap text-foreground">
      {LabelIcon && <LabelIcon className="size-3 shrink-0" stroke={1.75} />}
      {label}
      {Trailing && <Trailing className="size-3 shrink-0" stroke={1.75} />}
    </span>
  );
}

interface ConsoleStepOptions {
  host?: ConsoleHost;
  /** Leading icons for the few menu entries that have a recognisable one on the site. */
  icons?: Record<string, Icon>;
  /** Overrides for labels that need their own chip (e.g. a dropdown with a chevron). */
  chip?: (label: string) => ReactNode | undefined;
}

// Split a setup step on its "quoted" console labels: each label becomes a chip, the plain text
// between them keeps the console host link.
function renderConsoleStep(text: string, opts: ConsoleStepOptions = {}): ReactNode {
  const parts: ReactNode[] = [];
  const re = /"([^"]+)"/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) {
      parts.push(
        <Fragment key={key++}>{linkifyHost(text.slice(last, m.index), opts.host)}</Fragment>,
      );
    }
    const label = m[1];
    parts.push(
      <Fragment key={key++}>
        {opts.chip?.(label) ?? <ConsoleChip label={label} icon={opts.icons?.[label]} />}
      </Fragment>,
    );
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) {
    parts.push(<Fragment key={key++}>{linkifyHost(text.slice(last), opts.host)}</Fragment>);
  }
  return parts;
}

// Yandex Console labels are English regardless of the app locale.
const YANDEX_STEP: ConsoleStepOptions = {
  host: { marker: 'center.yandex.cloud', href: 'https://center.yandex.cloud' },
  icons: {
    'All services': IconGridDots,
    'Identity and Access Management': IconKey,
    'Service accounts': IconRobot,
    'Add role': IconPlus,
  },
};

const TIMEWEB_STEP: ConsoleStepOptions = {
  icons: { 'API и Terraform': IconCircles, 'API and Terraform': IconCircles },
};

const HETZNER_STEP: ConsoleStepOptions = {
  host: { marker: 'console.hetzner.com', href: 'https://console.hetzner.com' },
  icons: { Default: IconCrown, Security: IconKey, Безопасность: IconKey },
};

const HOSTKEY_USER_MENU = new Set(['Username', 'Пользователь']);
const HOSTKEY_STEP: ConsoleStepOptions = {
  host: { marker: 'invapi.hostkey.ru', href: 'https://invapi.hostkey.ru' },
  icons: { 'Add key': IconPlus, 'Добавить ключ': IconPlus },
  // The account menu is a dropdown on the site: user icon, name, chevron.
  chip: (label) =>
    HOSTKEY_USER_MENU.has(label) ? (
      <ConsoleChip label={label} icon={IconUser} trailing={IconChevronDown} />
    ) : undefined,
};

const DOUBLESERVERS_STEP: ConsoleStepOptions = {
  host: { marker: 'doubleservers.com', href: 'https://doubleservers.com/dashboard/profile' },
  icons: {
    Profile: IconUser,
    'BACKUP LOGIN VIA EMAIL': IconMail,
    'Authenticator app': IconDeviceMobile,
  },
};

const OPENROUTER_STEP: ConsoleStepOptions = {
  host: { marker: 'openrouter.ai', href: 'https://openrouter.ai' },
  icons: { 'Management Keys': IconLock, 'New Key': IconPlus },
  // The site's button reads "+ New Key"; the plus is drawn as the icon.
  chip: (label) =>
    label === '+ New Key' ? <ConsoleChip label="New Key" icon={IconPlus} /> : undefined,
};

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
  kind,
  accountUuid,
  storedSecrets,
}: ProviderCredentialFieldsProps) {
  const { t } = useTranslation();
  const optionalPh = t('common.optional');
  const revealCache = useRef<{ uuid: string; data: ProviderCredentialsReveal } | null>(null);
  const reveal = useCallback(
    async (field: SecretField) => {
      if (!accountUuid) return '';
      if (!revealCache.current || revealCache.current.uuid !== accountUuid) {
        try {
          revealCache.current = {
            uuid: accountUuid,
            data: await revealAccountCredentials(accountUuid),
          };
        } catch (e) {
          notifyError(apiErrorMessage(e));
          throw e;
        }
      }
      return revealCache.current.data[field] ?? '';
    },
    [accountUuid],
  );

  const baseUrl = form.watch('baseUrl');
  const yandexToken = form.watch('token');
  const yandexBody: YandexDiscover | null =
    kind !== 'yandex'
      ? null
      : yandexToken && isCompleteYandexKey(yandexToken)
        ? { token: yandexToken }
        : !yandexToken && accountUuid
          ? { accountUuid }
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
            {renderConsoleStep(t('providers.field.apiTokenDescHostkey'), HOSTKEY_STEP)}
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
              {renderConsoleStep(t('providers.field.apiTokenDescOpenrouter'), OPENROUTER_STEP)}
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
              <p>
                {renderConsoleStep(
                  t('providers.field.doubleserversSetupStep1'),
                  DOUBLESERVERS_STEP,
                )}
              </p>
              <p>
                {renderConsoleStep(
                  t('providers.field.doubleserversSetupStep2'),
                  DOUBLESERVERS_STEP,
                )}
              </p>
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
              {renderConsoleStep(t('providers.field.doubleserversSetupStep3'), DOUBLESERVERS_STEP)}
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
                <li>{renderConsoleStep(t('providers.field.yandexKeyStep1'), YANDEX_STEP)}</li>
                <li>{renderConsoleStep(t('providers.field.yandexKeyStep2'), YANDEX_STEP)}</li>
                <li>{renderConsoleStep(t('providers.field.yandexKeyStep3'), YANDEX_STEP)}</li>
                <li>{renderConsoleStep(t('providers.field.yandexKeyStep4'), YANDEX_STEP)}</li>
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
            <div className="space-y-3 rounded-lg bg-background p-3">
              <div className="space-y-1.5">
                <p className="text-[13px] text-ink-2">{t('providers.field.yandexScopeFolders')}</p>
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
                <p className="text-[13px] text-ink-2">{t('providers.field.yandexScopeBilling')}</p>
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
            {renderConsoleStep(t('providers.field.apiTokenDescHetzner'), HETZNER_STEP)}
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
            <p>{renderConsoleStep(t('providers.field.apiTokenDescTimeweb'), TIMEWEB_STEP)}</p>
            <a
              href="https://timeweb.cloud/my/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-slate underline-offset-2 hover:underline"
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
