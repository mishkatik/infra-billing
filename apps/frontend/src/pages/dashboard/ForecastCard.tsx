import type { ForecastPoint } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatMoney, formatMoneyTick } from '@/utils/format';

interface ForecastCardProps {
  forecast: ForecastPoint[] | undefined;
  base: string;
}

export function ForecastCard({ forecast, base }: ForecastCardProps) {
  const { t } = useTranslation();
  const chartMoney = (v: number) => formatMoney(String(v), base);
  const forecastData = (forecast ?? []).map((p) => ({
    month: p.month,
    actual: Number(p.actual),
    projected: Number(p.projected),
  }));
  // All-zero months mean a bare axis with no bars — skip the card entirely.
  if (!forecastData.some((p) => p.actual > 0 || p.projected > 0)) return null;
  const chartConfig = {
    actual: { label: t('dashboard.charts.actualSeries'), color: 'var(--chart-1)' },
    projected: { label: t('dashboard.charts.forecastSeries'), color: 'var(--chart-1)' },
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
                    formatter={(value, name, item) => (
                      <>
                        <div
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundColor: item.color,
                            opacity: name === 'projected' ? 0.45 : 1,
                          }}
                        />
                        <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                          <span className="text-muted-foreground">
                            {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                          </span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {chartMoney(Number(value))}
                          </span>
                        </div>
                      </>
                    )}
                  />
                }
              />
              <Bar dataKey="actual" stackId="spend" fill="var(--chart-1)" />
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
