import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconEdit,
  IconLink,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Account, Permission, ResetLink } from '@infra/shared';
import {
  useAccounts,
  useCreateAccount,
  useCreateInvite,
  useDeleteAccount,
  useIssueInviteLink,
  useUpdateAccount,
} from '@/api/accounts';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDisclosure } from '@/hooks/useDisclosure';
import { formatDate, formatDateShort } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { AccountFormModal, AREAS, type AccountFormValues } from './AccountFormModal';

const EMPTY_ACCOUNT_FORM: AccountFormValues = {
  username: '',
  password: '',
  permissions: [],
  projectUuids: [],
  disabled: false,
  inviteByLink: false,
};

/** Highest granted level for an area: edit implies read (server normalizes the same way). */
function areaLevel(
  permissions: Permission[],
  area: (typeof AREAS)[number]['area'],
  hasEdit: boolean,
): 'edit' | 'read' | 'none' {
  if (hasEdit && permissions.includes(`${area}:edit` as Permission)) return 'edit';
  if (permissions.includes(`${area}:read` as Permission)) return 'read';
  return 'none';
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { data: accounts, isLoading } = useAccounts();
  const { data: projects } = useProjects();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const createInvite = useCreateInvite();
  const issueInviteLink = useIssueInviteLink();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Account | null>(null);
  // The raw invite/reset link, captured once from create/issue responses. Shown once, then cleared.
  const [activeLink, setActiveLink] = useState<ResetLink | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<AccountFormValues>({
    defaultValues: EMPTY_ACCOUNT_FORM,
    mode: 'onSubmit',
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ ...EMPTY_ACCOUNT_FORM });
    open();
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    form.reset({
      username: acc.username ?? '',
      password: '',
      permissions: [...acc.permissions],
      projectUuids: [...acc.projectUuids],
      disabled: acc.disabled,
      inviteByLink: false,
    });
    open();
  };

  const submit = form.handleSubmit(async (v) => {
    try {
      if (editing) {
        await update.mutateAsync({
          uuid: editing.uuid,
          permissions: v.permissions,
          projectUuids: v.projectUuids,
          disabled: v.disabled,
          ...(v.password ? { password: v.password } : {}),
        });
        notifySuccess(t('accounts.saved'));
        close();
      } else if (v.inviteByLink) {
        const invite = await createInvite.mutateAsync({
          permissions: v.permissions,
          projectUuids: v.projectUuids,
        });
        close();
        setActiveLink(invite); // one-time reveal — the raw token isn't recoverable afterwards
      } else {
        await create.mutateAsync({
          username: v.username.trim(),
          password: v.password,
          permissions: v.permissions,
          projectUuids: v.projectUuids,
        });
        notifySuccess(t('accounts.created'));
        close();
      }
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (acc: Account) => {
    if (!window.confirm(t('accounts.confirmDelete', { name: acc.username ?? acc.uuid }))) return;
    try {
      await del.mutateAsync(acc.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // Pending: no confirm (nothing to lose). Existing account: warns the current password stops
  // working immediately, matching what issueInviteLink actually does server-side.
  const doInviteLink = async (acc: Account) => {
    if (!acc.pending && !window.confirm(t('accounts.confirmInviteLink', { name: acc.username })))
      return;
    try {
      setActiveLink(await issueInviteLink.mutateAsync(acc.uuid));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const closeLink = () => {
    setActiveLink(null);
    setCopied(false);
  };

  const inviteUrl = activeLink ? `${window.location.origin}/invite/${activeLink.token}` : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const projectNames = (uuids: string[]) =>
    uuids
      .map((uuid) => projects?.find((p) => p.uuid === uuid)?.name)
      .filter((name): name is string => !!name)
      .join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
        actions={
          <Button onClick={openCreate}>
            <IconPlus className="size-4" />
            {t('common.add')}
          </Button>
        }
      />

      <Card className="overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">{t('accounts.colUsername')}</TableHead>
                <TableHead className="text-muted-foreground">
                  {t('accounts.colPermissions')}
                </TableHead>
                <TableHead className="text-muted-foreground">{t('accounts.colProjects')}</TableHead>
                <TableHead className="text-muted-foreground">{t('accounts.colStatus')}</TableHead>
                <TableHead className="text-muted-foreground">{t('accounts.hasPasskeys')}</TableHead>
                <TableHead className="text-muted-foreground">{t('accounts.colCreated')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((acc) => (
                <TableRow key={acc.uuid}>
                  <TableCell className="font-semibold">
                    {acc.username ?? <span className="font-normal text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {AREAS.map(({ area, hasEdit }) => {
                        const level = areaLevel(acc.permissions, area, hasEdit);
                        return (
                          <Badge
                            key={area}
                            variant={level === 'none' ? 'outline' : 'secondary'}
                            className="text-[11px]"
                          >
                            {t(`accounts.area.${area}`)}:{' '}
                            {level === 'none'
                              ? t('common.none')
                              : t(level === 'edit' ? 'accounts.scopeEdit' : 'accounts.scopeRead')}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell title={projectNames(acc.projectUuids) || undefined}>
                    {acc.projectUuids.length}
                  </TableCell>
                  <TableCell>
                    {acc.disabled ? (
                      <Badge variant="secondary">{t('accounts.statusDisabled')}</Badge>
                    ) : acc.pending ? (
                      <Badge variant="outline">{t('accounts.statusPending')}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{t('accounts.statusActive')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {acc.hasPasskeys ? (
                      <span title={t('accounts.hasPasskeys')}>
                        <IconCheck className="size-4 text-muted-foreground" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('common.none')}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateShort(acc.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('accounts.inviteLinkAction')}
                            disabled={issueInviteLink.isPending}
                            onClick={() => doInviteLink(acc)}
                          >
                            <IconLink className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('accounts.inviteLinkAction')}</TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.edit')}
                        onClick={() => openEdit(acc)}
                      >
                        <IconEdit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={t('common.delete')}
                        onClick={() => doDelete(acc)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && accounts?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    {t('accounts.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AccountFormModal
        opened={opened}
        editing={editing}
        form={form}
        isPending={create.isPending || update.isPending || createInvite.isPending}
        onSubmit={submit}
        onClose={close}
      />

      <Dialog open={!!activeLink} onOpenChange={(o) => !o && closeLink()}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('accounts.linkReveal.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <IconAlertTriangle className="size-4" />
              <AlertDescription>{t('accounts.linkReveal.warning')}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
                {inviteUrl}
              </code>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={copied ? t('common.copied') : t('common.copy')}
                    onClick={copyLink}
                  >
                    {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? t('common.copied') : t('common.copy')}</TooltipContent>
              </Tooltip>
            </div>
            {activeLink && (
              <p className="text-xs text-muted-foreground">
                {t('accounts.linkReveal.expires', { date: formatDate(activeLink.expiresAt) })}
              </p>
            )}
            <Button className="w-full" onClick={closeLink}>
              {t('accounts.linkReveal.done')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
