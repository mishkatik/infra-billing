import type { Project } from '@infra/shared';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import {
  useCreateProject,
  useDeleteProject,
  useEmptyProject,
  useMoveAllToProject,
  useProjects,
  useUpdateProject,
} from '@/api/projects';
import { PageHeader } from '@/components/PageHeader';
import { DEFAULT_ICON_BG } from '@/components/tablerIconCatalog';
import { Button } from '@/components/ui/button';
import { useDisclosure } from '@/hooks/useDisclosure';
import { notifyError, notifySuccess } from '@/utils/notify';
import { ProjectFormModal, type ProjectFormValues } from './ProjectFormModal';
import { ProjectsTable } from './ProjectsTable';

const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  faviconLink: '',
  iconName: '',
  iconBg: '',
};

export function ProjectsPage() {
  const { t } = useTranslation();
  const { data: projects, isLoading } = useProjects();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const moveAll = useMoveAllToProject();
  const empty = useEmptyProject();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const form = useForm<ProjectFormValues>({
    defaultValues: EMPTY_PROJECT_FORM,
    mode: 'onSubmit',
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ ...EMPTY_PROJECT_FORM });
    open();
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    form.reset({
      name: p.name,
      faviconLink: p.faviconLink ?? '',
      iconName: p.iconName ?? '',
      iconBg: p.iconBg ?? '',
    });
    open();
  };

  const submit = form.handleSubmit(async (v) => {
    const icon = v.iconName
      ? { iconName: v.iconName, iconBg: v.iconBg || DEFAULT_ICON_BG }
      : { iconName: null as string | null, iconBg: null as string | null };
    const dto = {
      name: v.name.trim(),
      faviconLink: v.faviconLink.trim() || null,
      ...icon,
    };
    try {
      if (editing) {
        await update.mutateAsync({ uuid: editing.uuid, dto });
      } else {
        await create.mutateAsync({
          name: dto.name,
          faviconLink: dto.faviconLink ?? undefined,
          ...(v.iconName
            ? { iconName: v.iconName, iconBg: v.iconBg || DEFAULT_ICON_BG }
            : {}),
        });
      }
      close();
      notifySuccess(editing ? t('projects.updated') : t('projects.created'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (p: Project) => {
    if (!window.confirm(t('projects.confirmDelete', { name: p.name }))) return;
    try {
      await del.mutateAsync(p.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doMoveAll = async (p: Project) => {
    if (!window.confirm(t('projects.confirmMoveAll', { name: p.name }))) return;
    try {
      const { moved } = await moveAll.mutateAsync(p.uuid);
      notifySuccess(t('projects.movedToast', { count: moved }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doRemoveAll = async (p: Project) => {
    if (!window.confirm(t('projects.confirmRemoveAll', { name: p.name }))) return;
    try {
      const { moved } = await empty.mutateAsync(p.uuid);
      notifySuccess(t('projects.movedToast', { count: moved }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          <Button onClick={openCreate}>
            <IconPlus className="size-4" />
            {t('common.add')}
          </Button>
        }
      />

      <ProjectsTable
        projects={projects}
        isLoading={isLoading}
        moving={moveAll.isPending}
        emptying={empty.isPending}
        onMoveAll={doMoveAll}
        onRemoveAll={doRemoveAll}
        onEdit={openEdit}
        onDelete={doDelete}
      />

      <ProjectFormModal
        opened={opened}
        editing={editing}
        form={form}
        isPending={create.isPending || update.isPending}
        onSubmit={submit}
        onClose={close}
      />
    </div>
  );
}
