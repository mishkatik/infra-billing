import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProvidersPage } from './pages/providers/ProvidersPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ServicesPage } from './pages/services/ServicesPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { AuthSettingsPage } from './pages/auth-settings/AuthSettingsPage';
import { TokensPage } from './pages/TokensPage';

// Relative dates ("3 days ago") for the build badge; the locale is switched per render below.
dayjs.extend(relativeTime);

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
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="providers" element={<ProvidersPage />} />
                  <Route path="projects" element={<ProjectsPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="settings/auth" element={<AuthSettingsPage />} />
                  <Route path="settings/tokens" element={<TokensPage />} />
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
