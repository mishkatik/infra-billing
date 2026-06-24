import { useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  Pagination,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import {
  IconAlertTriangle,
  IconCalendarDollar,
  IconCash,
  IconChartBar,
  IconWallet,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useForecast, useSummary } from '@/api/analytics';
import { useProviders } from '@/api/providers';
import { useProjects } from '@/api/projects';
import { StatCard } from '@/components/StatCard';
import { ProviderIcon } from '@/components/ProviderIcon';
import { useEnums } from '@/constants';
import { formatDateShort, formatMoney } from '@/utils/format';
import { projectFavicon, providerFavicon } from '@/utils/favicon';

const COLORS = ['brand.6', 'teal.6', 'blue.6', 'orange.6', 'pink.6', 'grape.6', 'cyan.6', 'lime.6'];
const PROVIDER_PAGE_SIZE = 5;

const severityColor = (s: 'critical' | 'warning' | 'ok') =>
  s === 'critical' ? 'red' : s === 'warning' ? 'orange' : undefined;

export function DashboardPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: summary, isLoading } = useSummary();
  const { data: forecast } = useForecast(6);
  const { data: providers } = useProviders();
  const { data: projectsList } = useProjects();
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectIconOf = (uuid: string) =>
    projectFavicon(projectsList?.find((p) => p.uuid === uuid)?.faviconLink ?? null);

  const dayLabel = (n: number) =>
    n <= 0
      ? t('dashboard.due.today')
      : n === 1
        ? t('dashboard.due.tomorrow')
        : t('dashboard.due.inDays', { n });

  const base = summary?.baseCurrency ?? '';
  const chartMoney = (v: number) => formatMoney(String(v), base);
  const donutData = (summary?.byType ?? [])
    .filter((tp) => Number(tp.monthlyCost) > 0)
    .map((tp, i) => ({
      name: enums.serviceTypeLabel(tp.type),
      value: Number(tp.monthlyCost),
      color: COLORS[i % COLORS.length],
    }));
  const forecastData = (forecast ?? []).map((p) => ({
    month: p.month,
    value: Number(p.projected),
  }));
  const upcoming = summary?.upcomingBillings ?? [];
  const critical = upcoming.filter((b) => b.severity === 'critical');
  const providerRows = [...(summary?.byProvider ?? [])].sort(
    (a, b) => Number(b.spent) - Number(a.spent),
  );
  const [providerPage, setProviderPage] = useState(1);
  const providerPageCount = Math.max(1, Math.ceil(providerRows.length / PROVIDER_PAGE_SIZE));
  // Clamp in case the provider list shrank below the current page.
  const provPage = Math.min(providerPage, providerPageCount);
  const providerRowsPage = providerRows.slice(
    (provPage - 1) * PROVIDER_PAGE_SIZE,
    provPage * PROVIDER_PAGE_SIZE,
  );
  const projectRows = [...(summary?.byProject ?? [])].sort(
    (a, b) => Number(b.monthlyCost) - Number(a.monthlyCost),
  );
  const projectDonut = projectRows
    .filter((p) => Number(p.monthlyCost) > 0)
    .map((p, i) => ({
      name: p.name,
      value: Number(p.monthlyCost),
      color: COLORS[i % COLORS.length],
    }));

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{t('dashboard.title')}</Title>
        <Text c="dimmed">{t('dashboard.subtitle')}</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <StatCard
          label={t('dashboard.kpi.monthly')}
          value={formatMoney(summary?.monthlyTotal ?? '0', base)}
          icon={IconWallet}
        />
        <StatCard
          label={t('dashboard.kpi.yearly')}
          value={formatMoney(summary?.yearlyProjection ?? '0', base)}
          icon={IconChartBar}
          color="blue"
        />
        <StatCard
          label={t('dashboard.kpi.currentMonthPayments')}
          value={formatMoney(summary?.currentMonthPayments ?? '0', base)}
          icon={IconCash}
          color="teal"
        />
        <StatCard
          label={t('dashboard.kpi.totalSpent')}
          value={formatMoney(summary?.totalSpent ?? '0', base)}
          icon={IconCalendarDollar}
          color="grape"
        />
      </SimpleGrid>

      {critical.length > 0 && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title={t('dashboard.critical.title')}
        >
          <Stack gap={4}>
            {critical.map((b) => (
              <Text key={b.serviceUuid} size="sm">
                <b>
                  {b.providerName} — {b.name}
                </b>
                :{' '}
                {t('dashboard.critical.charge', {
                  when: dayLabel(b.daysUntil),
                  amount: formatMoney(b.cost, b.currency),
                })}
                {b.providerBalance != null &&
                  t('dashboard.critical.balance', {
                    amount: formatMoney(b.providerBalance, b.providerBalanceCurrency),
                  })}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" padding="lg">
          <Text fw={600} mb="md">
            {t('dashboard.charts.byType', { base })}
          </Text>
          {donutData.length > 0 ? (
            <Group justify="center">
              <DonutChart
                data={donutData}
                withLabelsLine
                withTooltip
                size={180}
                thickness={28}
                strokeWidth={0}
                valueFormatter={chartMoney}
              />
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              {isLoading ? t('common.loading') : t('dashboard.empty.noServices')}
            </Text>
          )}
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={600} mb="md">
            {t('dashboard.charts.forecast', { base })}
          </Text>
          {forecastData.length > 0 ? (
            <BarChart
              h={200}
              data={forecastData}
              dataKey="month"
              series={[
                { name: 'value', label: t('dashboard.charts.forecastSeries'), color: 'brand.6' },
              ]}
              valueFormatter={chartMoney}
              yAxisProps={{ tickFormatter: (v: number) => formatMoney(String(v)) }}
            />
          ) : (
            <Text c="dimmed" size="sm">
              {t('dashboard.empty.noData')}
            </Text>
          )}
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="md">
          {t('dashboard.byProject.title', { base })}
        </Text>
        {projectRows.length > 0 ? (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {projectDonut.length > 0 && (
              <Group justify="center">
                <DonutChart
                  data={projectDonut}
                  withTooltip
                  size={180}
                  thickness={28}
                  strokeWidth={0}
                  valueFormatter={chartMoney}
                />
              </Group>
            )}
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('dashboard.byProject.colProject')}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProject.colServices')}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProject.colMonthly', { base })}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projectRows.map((p) => (
                  <Table.Tr key={p.projectUuid}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <ProviderIcon name={p.name} src={projectIconOf(p.projectUuid)} size={18} />
                        <Text size="sm" fw={500}>
                          {p.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="end">{p.servicesCount}</Table.Td>
                    <Table.Td ta="end" style={{ whiteSpace: 'nowrap' }}>
                      <Text size="sm" fw={600}>
                        {formatMoney(p.monthlyCost, base)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </SimpleGrid>
        ) : (
          <Text c="dimmed" size="sm">
            {isLoading ? t('common.loading') : t('dashboard.empty.noServices')}
          </Text>
        )}
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="md">
          {t('dashboard.byProvider.title')}
        </Text>
        {providerRows.length > 0 ? (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('dashboard.byProvider.colProvider')}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProvider.colServices')}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProvider.colMonthly', { base })}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProvider.colSpent', { base })}</Table.Th>
                  <Table.Th ta="end">{t('dashboard.byProvider.colBalance')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {providerRowsPage.map((p) => (
                  <Table.Tr key={p.providerUuid}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <ProviderIcon
                          name={p.name}
                          src={providerFavicon(
                            providerOf(p.providerUuid) ?? { faviconLink: null, loginUrl: null },
                          )}
                          size={18}
                        />
                        <Text size="sm" fw={500}>
                          {p.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="end">{p.servicesCount}</Table.Td>
                    <Table.Td ta="end" style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(p.monthlyCost, base)}
                    </Table.Td>
                    <Table.Td ta="end" style={{ whiteSpace: 'nowrap' }}>
                      <Text size="sm" fw={600}>
                        {formatMoney(p.spent, base)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="end" style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(p.balance, p.balanceCurrency)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text c="dimmed" size="sm">
            {isLoading ? t('common.loading') : t('dashboard.empty.noProviders')}
          </Text>
        )}
        {providerRows.length > PROVIDER_PAGE_SIZE && (
          <Group justify="center" mt="md">
            <Pagination
              size="sm"
              total={providerPageCount}
              value={provPage}
              onChange={setProviderPage}
            />
          </Group>
        )}
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={600} mb="md">
          {t('dashboard.upcoming.title')}
        </Text>
        {upcoming.length > 0 ? (
          <Stack gap="xs">
            {upcoming.map((ub) => {
              const color = severityColor(ub.severity);
              return (
                <Group key={ub.serviceUuid} justify="space-between" wrap="nowrap">
                  <Text size="sm" c={color} style={{ whiteSpace: 'nowrap' }}>
                    {ub.providerName} — <b>{ub.name}</b>
                    {ub.covered === false && (
                      <Text span size="xs" c="red">
                        {t('dashboard.upcoming.insufficientBalance')}
                      </Text>
                    )}
                  </Text>
                  <Group gap="sm" wrap="nowrap">
                    <Badge size="sm" variant={color ? 'light' : 'default'} color={color}>
                      {dayLabel(ub.daysUntil)}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      {formatDateShort(ub.nextBillingAt)}
                    </Text>
                    <Text size="sm" fw={600}>
                      {formatMoney(ub.cost, ub.currency)}
                    </Text>
                  </Group>
                </Group>
              );
            })}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">
            {t('dashboard.empty.noUpcoming')}
          </Text>
        )}
      </Card>
    </Stack>
  );
}
