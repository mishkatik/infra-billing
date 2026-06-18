import { notifications } from '@mantine/notifications';
import { IconCheck, IconExclamationCircle } from '@tabler/icons-react';
import i18n from '@/i18n';

export function notifyError(message: string): void {
  notifications.show({
    color: 'red',
    title: i18n.t('notify.errorTitle'),
    message,
    icon: <IconExclamationCircle size={18} />,
    withBorder: true,
    autoClose: 6000,
  });
}

export function notifySuccess(message: string): void {
  notifications.show({
    color: 'teal',
    message,
    icon: <IconCheck size={18} />,
  });
}
