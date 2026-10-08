import type { SyncRun } from '@infra/shared';
import type { TFunction } from 'i18next';
import type { SyncAllResult } from '@/api/providers';
import { notifyError, notifySuccess } from '@/utils/notify';

/** Toast for a finished single-account sync (the run comes back as ok or error, never running). */
export function notifySyncRun(t: TFunction, run: SyncRun) {
  if (run.status === 'ok') notifySuccess(t('providers.syncedOne', { count: run.servicesFound }));
  else notifyError((run.error ?? '').slice(0, 200) || t('providers.syncFailed'));
}

export function notifySyncAll(t: TFunction, res: SyncAllResult) {
  if (res.failed === 0) notifySuccess(t('providers.syncedAll', { count: res.ok }));
  else notifyError(t('providers.syncedMixed', { ok: res.ok, failed: res.failed }));
}
