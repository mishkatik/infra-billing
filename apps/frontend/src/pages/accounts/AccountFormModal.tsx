import { IconLoader2 } from '@tabler/icons-react';
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Account, Permission } from '@infra/shared';
import { useProjects } from '@/api/projects';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface AccountFormValues {
  username: string;
  password: string;
  permissions: Permission[];
  projectUuids: string[];
  disabled: boolean;
  /** Create mode only: username/password are left to the invitee instead of set here. */
  inviteByLink: boolean;
}

interface AccountFormModalProps {
  opened: boolean;
  editing: Account | null;
  form: UseFormReturn<AccountFormValues>;
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
}

export const AREAS = [
  { area: 'dashboard', hasEdit: false },
  { area: 'services', hasEdit: true },
  { area: 'providers', hasEdit: true },
  { area: 'payments', hasEdit: true },
] as const;

function PermissionMatrix({
  value,
  onChange,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
}) {
  const { t } = useTranslation();
  const has = (p: Permission) => value.includes(p);
  const toggle = (p: Permission, on: boolean) => {
    const set = new Set(value);
    if (on) {
      set.add(p);
      if (p.endsWith(':edit')) set.add(p.replace(':edit', ':read') as Permission);
    } else {
      set.delete(p);
      if (p.endsWith(':read')) set.delete(p.replace(':read', ':edit') as Permission);
    }
    onChange([...set]);
  };
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[1fr_4rem_4rem] items-center border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span />
        <span className="text-center">{t('accounts.scopeRead')}</span>
        <span className="text-center">{t('accounts.scopeEdit')}</span>
      </div>
      <div className="divide-y">
        {AREAS.map(({ area, hasEdit }) => (
          <div key={area} className="grid grid-cols-[1fr_4rem_4rem] items-center px-3 py-2.5">
            <Label htmlFor={`perm-${area}-read`} className="text-sm font-normal">
              {t(`accounts.area.${area}`)}
            </Label>
            <div className="flex justify-center">
              <Checkbox
                id={`perm-${area}-read`}
                checked={has(`${area}:read` as Permission)}
                disabled={hasEdit && has(`${area}:edit` as Permission)}
                onCheckedChange={(v) => toggle(`${area}:read` as Permission, v === true)}
              />
            </div>
            <div className="flex justify-center">
              {hasEdit ? (
                <Checkbox
                  id={`perm-${area}-edit`}
                  aria-label={`${t(`accounts.area.${area}`)}: ${t('accounts.scopeEdit')}`}
                  checked={has(`${area}:edit` as Permission)}
                  onCheckedChange={(v) => toggle(`${area}:edit` as Permission, v === true)}
                />
              ) : (
                <span aria-hidden className="text-sm text-muted-foreground/50">
                  —
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountFormModal({
  opened,
  editing,
  form,
  isPending,
  onSubmit,
  onClose,
}: AccountFormModalProps) {
  const { t } = useTranslation();
  const { data: projects } = useProjects();
  const usernameError = form.formState.errors.username;
  const passwordError = form.formState.errors.password;
  const permissions = form.watch('permissions');
  const projectUuids = form.watch('projectUuids');
  const disabled = form.watch('disabled');
  const inviteByLink = form.watch('inviteByLink');

  const toggleProject = (uuid: string, on: boolean) => {
    const set = new Set(projectUuids);
    if (on) set.add(uuid);
    else set.delete(uuid);
    form.setValue('projectUuids', [...set], { shouldDirty: true });
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('accounts.modalEdit') : t('accounts.modalCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {!editing && (
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="account-invite-toggle">{t('accounts.inviteToggle')}</Label>
                <p className="text-xs text-muted-foreground">{t('accounts.inviteToggleHint')}</p>
              </div>
              <Switch
                id="account-invite-toggle"
                checked={inviteByLink}
                onCheckedChange={(v) => form.setValue('inviteByLink', v, { shouldDirty: true })}
              />
            </div>
          )}

          {!inviteByLink && (
            <div className="space-y-2">
              <Label htmlFor="account-username">
                {t('accounts.fieldUsername')}{' '}
                {!editing && <span className="text-destructive">*</span>}
              </Label>
              {editing ? (
                <Input id="account-username" value={editing.username ?? ''} disabled readOnly />
              ) : (
                <>
                  <Input
                    id="account-username"
                    autoFocus
                    autoComplete="off"
                    aria-invalid={!!usernameError}
                    {...form.register('username', {
                      validate: (v) => {
                        const trimmed = v.trim();
                        if (!trimmed) return t('validation.enterName');
                        if (trimmed.length > 64) return t('validation.usernameLength');
                        return true;
                      },
                    })}
                  />
                  {usernameError && (
                    <p className="text-xs text-destructive">{usernameError.message}</p>
                  )}
                </>
              )}
            </div>
          )}

          {!inviteByLink && (
            <div className="space-y-2">
              <Label htmlFor="account-password">
                {t('accounts.fieldPassword')}{' '}
                {!editing && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!passwordError}
                {...form.register('password', {
                  validate: (v) => {
                    if (!v) return editing ? true : t('accounts.passwordRequired');
                    if (v.length < 8 || v.length > 128) return t('validation.passwordLength');
                    return true;
                  },
                })}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">{t('accounts.fieldPasswordKeep')}</p>
              )}
              {passwordError && <p className="text-xs text-destructive">{passwordError.message}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('accounts.fieldPermissions')}</Label>
            <PermissionMatrix
              value={permissions}
              onChange={(next) => form.setValue('permissions', next, { shouldDirty: true })}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('accounts.fieldProjects')}</Label>
            {projects && projects.length > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-md border">
                <div className="divide-y">
                  {projects.map((p) => (
                    <Label
                      key={p.uuid}
                      htmlFor={`account-project-${p.uuid}`}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm font-normal hover:bg-muted/40"
                    >
                      <Checkbox
                        id={`account-project-${p.uuid}`}
                        checked={projectUuids.includes(p.uuid)}
                        onCheckedChange={(v) => toggleProject(p.uuid, v === true)}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                    </Label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('accounts.noProjects')}</p>
            )}
          </div>

          {editing && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="account-disabled">{t('accounts.fieldDisabled')}</Label>
              <Switch
                id="account-disabled"
                checked={disabled}
                onCheckedChange={(v) => form.setValue('disabled', v, { shouldDirty: true })}
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <IconLoader2 className="size-4 animate-spin" />}
            {editing
              ? t('accounts.save')
              : inviteByLink
                ? t('accounts.createInvite')
                : t('accounts.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
