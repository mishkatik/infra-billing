import axios from 'axios';
import { API_PREFIX, API_PATH } from '@infra/shared';
import i18n from '@/i18n';

/** Single axios instance. Cookie session → withCredentials. */
export const api = axios.create({
  baseURL: `/${API_PREFIX}`,
  withCredentials: true,
});

// On 401, send the user to the login screen — except for the /auth/me probe
// (RequireAuth handles that softly) and when already on /login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    if (status === 401 && !url.endsWith(API_PATH.AUTH.ME) && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from an API error envelope (clamped for notifications). */
export function apiErrorMessage(error: unknown, fallback?: string): string {
  const e = error as { response?: { data?: { error?: { message?: string } } } };
  const msg = e?.response?.data?.error?.message ?? fallback ?? i18n.t('notify.errorTitle');
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
