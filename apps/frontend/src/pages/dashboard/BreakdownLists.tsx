import type { AnalyticsSummary, Project } from '@infra/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Card } from '@/components/ui/card';
import { useEnums } from '@/constants';
import { projectFavicon } from '@/utils/favicon';
import { formatMoney } from '@/utils/format';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { ServiceTypeGlyph } from '@/pages/services/ServiceTypeIcon';

interface RankedItem {
  key: string;
  name: ReactNode;
  count: number;
  monthly: string;
}

/** Ranked list: name, service count, monthly amount, and a thin slate bar for the share. */
function RankedList({ title, base, items }: { title: string; base: string; items: RankedItem[] }) {
  const { t } = useTranslation();
  const max = Math.max(0, ...items.map((i) => Number(i.monthly)));
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={title} count={items.length}>
        {base && (
          <span className="shrink-0 text-xs text-ink-2">
            {t('dashboard.breakdown.perMonth', { base })}
          </span>
        )}
      </CardHeadRow>
      <ul className="px-6 py-3">
        {items.map((i) => {
          const share = max > 0 ? (Number(i.monthly) / max) * 100 : 0;
          return (
            <li key={i.key} className="py-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">{i.name}</div>
                <span className="shrink-0 text-[13px] text-ink-2">
                  {t('dashboard.breakdown.services', { count: i.count })}
                </span>
                <span className="w-28 shrink-0 text-right">{formatMoney(i.monthly)}</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-slate" style={{ width: `${share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const byMonthly = (a: { monthlyCost: string }, b: { monthlyCost: string }) =>
  Number(b.monthlyCost) - Number(a.monthlyCost);

export function ByTypeList({ byType, base }: { byType: AnalyticsSummary['byType']; base: string }) {
  const { t } = useTranslation();
  const enums = useEnums();
  const rows = byType.filter((r) => Number(r.monthlyCost) > 0).sort(byMonthly);
  // Nothing billed monthly: an empty ranking is just noise.
  if (rows.length === 0) return null;
  return (
    <RankedList
      title={t('dashboard.breakdown.byType')}
      base={base}
      items={rows.map((r) => ({
        key: r.type,
        name: (
          <div className="flex min-w-0 items-center gap-2">
            <ServiceTypeGlyph type={r.type} size={18} />
            <span className="truncate">{enums.serviceTypeLabel(r.type)}</span>
          </div>
        ),
        count: r.servicesCount,
        monthly: r.monthlyCost,
      }))}
    />
  );
}

export function ByProjectList({
  byProject,
  base,
  projectOf,
}: {
  byProject: AnalyticsSummary['byProject'];
  base: string;
  projectOf: (uuid: string) => Project | undefined;
}) {
  const { t } = useTranslation();
  // A lone default project with no services carries no information.
  if (!byProject.some((p) => p.servicesCount > 0)) return null;
  const rows = [...byProject].sort(byMonthly);
  return (
    <RankedList
      title={t('dashboard.breakdown.byProject')}
      base={base}
      items={rows.map((r) => {
        const project = projectOf(r.projectUuid);
        return {
          key: r.projectUuid,
          name: (
            <div className="flex min-w-0 items-center gap-2">
              <ProviderIcon
                name={r.name}
                src={projectFavicon(project)}
                iconName={project?.iconName}
                iconBg={project?.iconBg}
                size={18}
              />
              <span className="truncate">{r.name}</span>
            </div>
          ),
          count: r.servicesCount,
          monthly: r.monthlyCost,
        };
      })}
    />
  );
}
