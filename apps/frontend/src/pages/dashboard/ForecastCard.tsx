import type { ForecastPoint } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useSettings } from '@/api/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatMoney, formatMoneyTick } from '@/utils/format';

interface ForecastCardProps {
  forecast: ForecastPoint[] | undefined;
  base: string;
}

export function ForecastCard({ forecast, base }: ForecastCardProps) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  // Force mode duplicates the tariff fill into actual — stacking estimated would double the bar.
  const showEstimated =
    Boolean(settings?.forecastTariffBackfill) && !settings?.forecastTariffBackfillForce;
  const chartMoney = (v: number) => formatMoney(String(v), base);
  const forecastData = (forecast ?? []).map((p) => {
    const actual = Number(p.actual);
    const estimated = Number(p.estimated);
    const projected = Number(p.projected);
    // Estimated is the full portfolio monthly cost and overrides the bar (not stacked on actual).
    const override = showEstimated && estimated > 0;
    return {
      month: p.month,
      actual: override ? 0 : actual,
      estimated: showEstimated ? estimated : 0,
      projected,
      actualTip: actual,
      estimatedTip: estimated,
    };
  });
  // All-zero months mean a bare axis with no bars — skip the card entirely.
  if (
    !forecastData.some((p) => p.actual > 0 || p.projected > 0 || (showEstimated && p.estimated > 0))
  ) {
    return null;
  }
  const chartConfig = {
    actual: { label: t('dashboard.charts.actualSeries'), color: 'var(--chart-1)' },
    estimated: { label: t('dashboard.charts.estimatedSeries'), color: 'var(--chart-1)' },
    projected: { label: t('dashboard.charts.forecastSeries'), color: 'var(--chart-1)' },
  };
  const seriesOpacity = (name: string) => {
    if (name === 'projected') return 0.45;
    if (name === 'estimated') return 0.7;
    return 1;
  };
  const tipValue = (
    name: string,
    value: number,
    payload: { actualTip?: number; estimatedTip?: number },
  ) => {
    if (name === 'actual') return payload.actualTip ?? value;
    if (name === 'estimated') return payload.estimatedTip ?? value;
    return value;
  };
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{t('dashboard.charts.forecast', { base })}</CardTitle>
      </CardHeader>
      <CardContent>
        {forecastData.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <BarChart data={forecastData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              {/* width="auto" — дефолтные 60px обрезают длинные суммы («100 000»). */}
              <YAxis
                width="auto"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatMoneyTick}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const n = String(name);
                      // Skip zero actual segment hidden by estimated override (tip still shown below).
                      if (
                        n === 'actual' &&
                        Number(value) === 0 &&
                        Number(item.payload?.estimated) > 0
                      ) {
                        return (
                          <>
                            <div
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: item.color, opacity: 1 }}
                            />
                            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                              <span className="truncate text-muted-foreground">
                                {chartConfig.actual.label}
                              </span>
                              <span className="shrink-0 whitespace-nowrap font-mono font-medium text-foreground tabular-nums">
                                {chartMoney(Number(item.payload?.actualTip ?? 0))}
                              </span>
                            </div>
                          </>
                        );
                      }
                      return (
                        <>
                          <div
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{
                              backgroundColor: item.color,
                              opacity: seriesOpacity(n),
                            }}
                          />
                          <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                            <span className="truncate text-muted-foreground">
                              {chartConfig[n as keyof typeof chartConfig]?.label ?? name}
                            </span>
                            <span className="shrink-0 whitespace-nowrap font-mono font-medium text-foreground tabular-nums">
                              {chartMoney(
                                tipValue(
                                  n,
                                  Number(value),
                                  item.payload as {
                                    actualTip?: number;
                                    estimatedTip?: number;
                                  },
                                ),
                              )}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="actual" stackId="spend" fill="var(--chart-1)" />
              {showEstimated && (
                <Bar dataKey="estimated" stackId="spend" fill="var(--chart-1)" fillOpacity={0.7} />
              )}
              {/* Forecast segment uses the same brand color, just semi-transparent. */}
              <Bar dataKey="projected" stackId="spend" fill="var(--chart-1)" fillOpacity={0.45} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dashboard.empty.noData')}</p>
        )}
      </CardContent>
    </Card>
  );
}
