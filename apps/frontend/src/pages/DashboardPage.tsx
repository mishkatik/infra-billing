import { Alert, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
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
import { StatCard } from '@/components/StatCard';
import { useEnums } from '@/constants';
import { formatDateShort, formatMoney } from '@/utils/format';

const COLORS = ['brand.6', 'teal.6', 'blue.6', 'orange.6', 'pink.6', 'grape.6', 'cyan.6', 'lime.6'];

const severityColor = (s: 'critical' | 'warning' | 'ok') =>
  s === 'critical' ? 'red' : s === 'warning' ? 'orange' : undefined;

export function DashboardPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: summary, isLoading } = useSummary();
  const { data: forecast } = useForecast(6);

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
                {b.providerBalance != null && (
                  <>
                    {t('dashboard.critical.balance', {
                      amount: formatMoney(b.providerBalance, b.providerBalanceCurrency),
                    })}
                  </>
                )}
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
                    <Badge size="sm" variant="light" color={color ?? 'gray'}>
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
