import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceFilter } from '@/api/services';
import { ResetViewButton } from '@/components/ResetViewButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// SelectItem forbids value="" — sentinel for the "no filter" option.
const ALL = 'all';

interface ServicesFiltersProps {
  filter: ServiceFilter;
  setFilter: Dispatch<SetStateAction<ServiceFilter>>;
  providerOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  /** Column sort is part of the saved view too: it shows and resets together with the filters. */
  sortActive: boolean;
  onReset: () => void;
}

export function ServicesFilters({
  filter,
  setFilter,
  providerOptions,
  projectOptions,
  typeOptions,
  sortActive,
  onReset,
}: ServicesFiltersProps) {
  const { t } = useTranslation();
  // The reset button doubles as the "view is not default" cue — a restored filter or sort is
  // otherwise easy to miss on a list that just looks short or oddly ordered.
  const active = sortActive || Object.values(filter).some((v) => v !== undefined);
  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={filter.providerUuid ?? ALL}
        onValueChange={(v) => setFilter((f) => ({ ...f, providerUuid: v === ALL ? undefined : v }))}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('services.filterAllProviders')}</SelectItem>
          {providerOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.projectUuid ?? ALL}
        onValueChange={(v) => setFilter((f) => ({ ...f, projectUuid: v === ALL ? undefined : v }))}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('services.filterAllProjects')}</SelectItem>
          {projectOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.type ?? ALL}
        onValueChange={(v) => setFilter((f) => ({ ...f, type: v === ALL ? undefined : v }))}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('services.filterAllTypes')}</SelectItem>
          {typeOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.isActive === undefined ? ALL : String(filter.isActive)}
        onValueChange={(v) =>
          setFilter((f) => ({ ...f, isActive: v === ALL ? undefined : v === 'true' }))
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('services.filterAll')}</SelectItem>
          <SelectItem value="true">{t('services.activityActive')}</SelectItem>
          <SelectItem value="false">{t('services.activityInactive')}</SelectItem>
        </SelectContent>
      </Select>
      {active && <ResetViewButton onClick={onReset} />}
    </div>
  );
}
