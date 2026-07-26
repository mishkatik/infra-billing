import type { Icon } from '@tabler/icons-react';
import { Card } from '@/components/ui/card';

interface StatCardProps {
  label: string;
  value: string;
  icon: Icon;
  /** Accepted but unused, so call sites don't have to change; the icon chip uses a single accent style. */
  color?: string;
}

export function StatCard({ label, value, icon: IconCmp }: StatCardProps) {
  return (
    <Card
      data-kpi-card
      className="flex-row items-center justify-between gap-4 overflow-hidden rounded-xl p-5"
    >
      <div className="min-w-0 flex-1">
        <p data-kpi-label className="section-label whitespace-nowrap">
          {label}
        </p>
        <p data-kpi-value className="mt-1 whitespace-nowrap text-2xl font-bold">
          {value}
        </p>
      </div>
      <div
        data-kpi-icon
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-foreground/15 bg-background text-foreground"
      >
        <IconCmp size={20} stroke={1.75} />
      </div>
    </Card>
  );
}
