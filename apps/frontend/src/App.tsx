import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import { theme } from './theme';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { ServicesPage } from './pages/ServicesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  dayjs.locale(locale);

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale, firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="providers" element={<ProvidersPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
