import {
  type Icon,
  IconExternalLink,
  IconGridDots,
  IconKey,
  IconPlus,
  IconRefresh,
  IconRobot,
} from '@tabler/icons-react';
import { Fragment, type ReactNode } from 'react';
import type { YandexDiscover } from '@infra/shared';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useYandexDiscover } from '@/api/providers';
import { NetcupAuthorizeButton } from '@/components/NetcupAuthorizeButton';
import { PasswordInput } from '@/components/PasswordInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FormValues } from './providerForm';

interface ProviderCredentialFieldsProps {
  form: UseFormReturn<FormValues>;
  editing: boolean;
  // Set in the edit modal so Yandex discovery can reuse the stored key without re-pasting it.
  providerUuid?: string;
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

// The per-connector credential inputs, switched on the selected kind. Secret inputs use the
// "keep empty to keep unchanged" placeholder when editing.
export function ProviderCredentialFields({
  form,
  editing,
  providerUuid,
}: ProviderCredentialFieldsProps) {
  const { t } = useTranslation();
  const kind = form.watch('kind');
  const keepEmpty = editing ? t('providers.keepEmpty') : '';
  const keepEmptyOrOptional = editing ? t('providers.keepEmpty') : t('common.optional');

  // Yandex scope badges: the connector auto-resolves the folders it scans for servers and the
  // billing account it reads, so we just surface them read-only. Resolved from the entered key
  // (create) or the stored provider (edit, empty field = keep the key unchanged). A keyed query so
  // the result is cached per input and survives StrictMode's double mount.
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
          <PasswordInput
            id="cred-password"
            placeholder={keepEmpty}
            {...form.register('password')}
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
          <PasswordInput id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
          <PasswordInput
            id="cred-password"
            placeholder={keepEmpty}
            {...form.register('password')}
          />
        </Field>
        {kind === 'billmgr' && (
          <Field
            id="cred-totp"
            label={t('providers.field.totpSecret')}
            description={t('providers.field.totpSecretDesc')}
          >
            <PasswordInput
              id="cred-totp"
              placeholder={keepEmptyOrOptional}
              {...form.register('totpSecret')}
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
          <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
          <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
        <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
        <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
        <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
      </Field>
    );
  }

  if (kind === 'aeza') {
    return (
      <Field
        id="cred-token"
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescAeza')}
        link="https://my.aeza.net/settings/apikeys"
      >
        <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
        <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
      </Field>
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
          <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
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
          <PasswordInput
            id="cred-password"
            placeholder={keepEmpty}
            {...form.register('password')}
          />
        </Field>
        <Field
          id="cred-totp"
          label={t('providers.field.totpSecret')}
          description={t('providers.field.totpSecretDesc')}
        >
          <PasswordInput
            id="cred-totp"
            placeholder={keepEmptyOrOptional}
            {...form.register('totpSecret')}
          />
        </Field>
        <Field
          id="cred-api-password"
          label={t('providers.field.begetApiPassword')}
          description={t('providers.field.begetApiPasswordDesc')}
          link="https://cp.beget.com/settings/security/api"
        >
          <PasswordInput
            id="cred-api-password"
            placeholder={keepEmptyOrOptional}
            {...form.register('apiPassword')}
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
          <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
        </Field>
        <Field id="cred-secret-key" label={t('providers.field.porkbunSecretKey')}>
          <PasswordInput
            id="cred-secret-key"
            placeholder={keepEmpty}
            {...form.register('secretKey')}
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
              <ol className="mt-1 list-decimal space-y-1.5 pl-4 leading-7">
                <li>{renderYaStep(t('providers.field.yandexKeyStep1'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep2'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep3'))}</li>
                <li>{renderYaStep(t('providers.field.yandexKeyStep4'))}</li>
              </ol>
            </>
          }
        >
          <Textarea
            id="cred-token"
            rows={7}
            className="font-mono text-xs"
            placeholder={
              editing
                ? t('providers.keepEmpty')
                : '{\n  "id": "...",\n  "service_account_id": "...",\n  "key_algorithm": "...",\n  "public_key": "...",\n  "private_key": "..."\n}'
            }
            {...form.register('token')}
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

  if (kind === 'manual') return null;

  return (
    <Field
      id="cred-token"
      label={t('providers.field.apiToken')}
      link={kind === 'timeweb' ? 'https://timeweb.cloud/my/api-keys' : undefined}
    >
      <Input id="cred-token" placeholder={keepEmpty} {...form.register('token')} />
    </Field>
  );
}
