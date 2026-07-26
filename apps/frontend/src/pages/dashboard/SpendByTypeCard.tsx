import type { AnalyticsSummary } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useEnums } from '@/constants';
import { formatMoney } from '@/utils/format';
import { DONUT_COLORS } from './dashboardUtils';

interface SpendByTypeCardProps {
  byType: AnalyticsSummary['byType'];
  base: string;
  isLoading: boolean;
}

export function SpendByTypeCard({ byType, base, isLoading }: SpendByTypeCardProps) {
  const { t } = useTranslation();
  const enums = useEnums();
  const chartMoney = (v: number) => formatMoney(String(v), base);
  const donutData = byType
    .filter((tp) => Number(tp.monthlyCost) > 0)
    .map((tp, i) => ({
      name: enums.serviceTypeLabel(tp.type),
      value: Number(tp.monthlyCost),
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  // No data — skip the card entirely; an empty donut on the dashboard is just noise.
  if (donutData.length === 0) return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{t('dashboard.charts.byType', { base })}</CardTitle>
      </CardHeader>
      <CardContent>
        {donutData.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <ChartContainer config={{}} className="aspect-square h-[180px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name, item) => (
                        <>
                          <div
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: item.payload?.fill ?? item.color }}
                          />
                          <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                            <span className="truncate text-muted-foreground">{name}</span>
                            <span className="shrink-0 whitespace-nowrap font-mono font-medium text-foreground tabular-nums">
                              {chartMoney(Number(value))}
                            </span>
                          </div>
                        </>
                      )}
                    />
                  }
                />
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  strokeWidth={0}
                  // Match the Bar defaults (0/400ms): Pie defaults to a 400ms delay + 1.5s sweep.
                  animationBegin={0}
                  animationDuration={400}
                >
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="space-y-1.5">
              {donutData.map((d) => (
                <li key={d.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="ml-auto pl-4 font-medium tabular-nums">
                    {chartMoney(d.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLoading ? t('common.loading') : t('dashboard.empty.noServices')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
