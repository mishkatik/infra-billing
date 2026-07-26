import type { AnalyticsSummary, Project } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart } from 'recharts';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { projectFavicon } from '@/utils/favicon';
import { formatMoney } from '@/utils/format';
import { DONUT_COLORS } from './dashboardUtils';

interface ByProjectCardProps {
  projectRows: AnalyticsSummary['byProject'];
  base: string;
  isLoading: boolean;
  projectOf: (uuid: string) => Project | undefined;
}

export function ByProjectCard({ projectRows, base, isLoading, projectOf }: ByProjectCardProps) {
  const { t } = useTranslation();
  const chartMoney = (v: number) => formatMoney(String(v), base);
  const rows = [...projectRows].sort((a, b) => Number(b.monthlyCost) - Number(a.monthlyCost));
  const projectDonut = rows
    .filter((p) => Number(p.monthlyCost) > 0)
    .map((p, i) => ({
      name: p.name,
      value: Number(p.monthlyCost),
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  // A single default project with no services carries no information; skip the card entirely.
  if (!rows.some((p) => (p.servicesCount ?? 0) > 0)) return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{t('dashboard.byProject.title', { base })}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="grid items-center gap-6 md:grid-cols-2">
            {projectDonut.length > 0 && (
              <div className="flex justify-center">
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
                      data={projectDonut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={88}
                      strokeWidth={0}
                      // Match the Bar defaults (0/400ms): Pie defaults to a 400ms delay + 1.5s sweep.
                      animationBegin={0}
                      animationDuration={400}
                    >
                      {projectDonut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-muted-foreground">
                    {t('dashboard.byProject.colProject')}
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    {t('dashboard.byProject.colServices')}
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    {t('dashboard.byProject.colMonthly', { base })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.projectUuid}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProviderIcon
                          name={p.name}
                          src={projectFavicon(projectOf(p.projectUuid)?.faviconLink ?? null)}
                          iconName={projectOf(p.projectUuid)?.iconName}
                          iconBg={projectOf(p.projectUuid)?.iconBg}
                          size={18}
                        />
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{p.servicesCount}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(p.monthlyCost, base)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
