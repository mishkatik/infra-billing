import { DEFAULT_PROJECT_UUID, type Project } from '@infra/shared';
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconFolderMinus,
  IconFolderPlus,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { projectFavicon } from '@/utils/favicon';

interface ProjectsTableProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  moving: boolean;
  emptying: boolean;
  onMoveAll: (p: Project) => void;
  onRemoveAll: (p: Project) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}

function CopyUuidButton({ uuid }: { uuid: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(uuid);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-ink-3 hover:text-foreground"
          aria-label={t('projects.copyUuid')}
          onClick={copy}
        >
          {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t('projects.uuidCopied') : t('projects.copyUuid')}</TooltipContent>
    </Tooltip>
  );
}

export function ProjectsTable({
  projects,
  isLoading,
  moving,
  emptying,
  onMoveAll,
  onRemoveAll,
  onEdit,
  onDelete,
}: ProjectsTableProps) {
  const { t } = useTranslation();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('projects.title')} count={projects?.length ?? 0} />
      <div className="overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t('projects.colName')}</TableHead>
              <TableHead className="text-right">{t('projects.colServices')}</TableHead>
              <TableHead className="pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.map((p) => {
              const isDefault = p.uuid === DEFAULT_PROJECT_UUID;
              return (
                <TableRow key={p.uuid}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      <ProviderIcon
                        name={p.name}
                        src={projectFavicon(p)}
                        iconName={p.iconName}
                        iconBg={p.iconBg}
                        size={24}
                      />
                      <span className="font-medium">{p.name}</span>
                      {isDefault && <Badge variant="secondary">{t('projects.defaultBadge')}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{p.servicesCount ?? 0}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-0.5">
                      <CopyUuidButton uuid={p.uuid} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-ink-3 hover:text-foreground"
                              aria-label={t('projects.actionMoveAll')}
                              disabled={moving}
                              onClick={() => onMoveAll(p)}
                            >
                              {moving ? (
                                <IconLoader2 className="size-4 animate-spin" />
                              ) : (
                                <IconFolderPlus className="size-4" />
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('projects.actionMoveAll')}</TooltipContent>
                      </Tooltip>
                      {!isDefault && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-ink-3 hover:text-foreground"
                                aria-label={t('projects.actionRemoveAll')}
                                disabled={emptying}
                                onClick={() => onRemoveAll(p)}
                              >
                                {emptying ? (
                                  <IconLoader2 className="size-4 animate-spin" />
                                ) : (
                                  <IconFolderMinus className="size-4" />
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t('projects.actionRemoveAll')}</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-ink-3 hover:text-foreground"
                            aria-label={t('common.edit')}
                            onClick={() => onEdit(p)}
                          >
                            <IconEdit className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.edit')}</TooltipContent>
                      </Tooltip>
                      {!isDefault && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-ink-3 hover:bg-fail-bg hover:text-destructive"
                              aria-label={t('common.delete')}
                              onClick={() => onDelete(p)}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common.delete')}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && projects?.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-6 text-center text-ink-2">
                  {t('projects.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
