import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import { useMe } from '@/api/auth';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { APP_PAGES, pageAllowed } from './auth/pages';
import { RequireAuth } from './auth/RequireAuth';
import { RequirePermRoute } from './auth/RequirePermRoute';
import { AppLayout } from './layout/AppLayout';
import { InvitePage } from './pages/InvitePage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProvidersPage } from './pages/providers/ProvidersPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ServicesPage } from './pages/services/ServicesPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { AuthSettingsPage } from './pages/auth-settings/AuthSettingsPage';
import { TokensPage } from './pages/TokensPage';
import { AccountsPage } from './pages/accounts/AccountsPage';

/** path -> element for every non-index page in APP_PAGES; components stay statically imported here. */
const PAGE_ELEMENTS: Record<string, ReactNode> = {
  providers: <ProvidersPage />,
  projects: <ProjectsPage />,
  services: <ServicesPage />,
  payments: <PaymentsPage />,
  settings: <SettingsPage />,
  'settings/auth': <AuthSettingsPage />,
  'settings/tokens': <TokensPage />,
  'settings/accounts': <AccountsPage />,
};

/** Fallback priority for the index redirect once dashboard access is ruled out; auth settings is the ungated catch-all. */
const HOME_FALLBACK_PATHS = ['services', 'providers', 'payments'];

/** Index redirect: dashboard first, then a fixed fallback priority, auth settings as the final catch-all. */
function HomeRoute() {
  const me = useMe();
  if (me.isLoading) return null;
  const dashboard = APP_PAGES.find((page) => page.path === '');
  if (dashboard && pageAllowed(me.data, dashboard)) return <DashboardPage />;
  for (const path of HOME_FALLBACK_PATHS) {
    const page = APP_PAGES.find((p) => p.path === path);
    if (page && pageAllowed(me.data, page)) return <Navigate to={`/${path}`} replace />;
  }
  return <Navigate to="/settings/auth" replace />;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  dayjs.locale(locale);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <Toaster position="top-right" richColors />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<HomeRoute />} />
                  {APP_PAGES.filter((page) => page.path !== '').map((page) => (
                    <Route
                      key={page.path}
                      path={page.path}
                      element={
                        page.perm || page.adminOnly ? (
                          <RequirePermRoute perm={page.perm} adminOnly={page.adminOnly}>
                            {PAGE_ELEMENTS[page.path]}
                          </RequirePermRoute>
                        ) : (
                          PAGE_ELEMENTS[page.path]
                        )
                      }
                    />
                  ))}
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
