import { IconFilter } from '@tabler/icons-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceFilter } from '@/api/services';
import { Segmented } from '@/components/ink/Segmented';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// SelectItem forbids value="" — sentinel for the "no filter" option.
const ALL = 'all';

type Activity = 'all' | 'active' | 'inactive';

interface FilterProps {
  filter: ServiceFilter;
  setFilter: Dispatch<SetStateAction<ServiceFilter>>;
}

/** All · Active · Inactive in the header bar, bound to the persisted `isActive` filter. */
export function ServicesActivityControl({ filter, setFilter }: FilterProps) {
  const { t } = useTranslation();
  const value: Activity =
    filter.isActive === undefined ? 'all' : filter.isActive ? 'active' : 'inactive';
  return (
    <Segmented<Activity>
      ariaLabel={t('services.activityFilter')}
      value={value}
      onChange={(v) =>
        setFilter((f) => ({ ...f, isActive: v === 'all' ? undefined : v === 'active' }))
      }
      options={[
        { value: 'all', label: t('common.all') },
        { value: 'active', label: t('services.activityActive') },
        { value: 'inactive', label: t('services.activityInactive') },
      ]}
    />
  );
}

interface ServicesFilterPopoverProps extends FilterProps {
  providerOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
}

/** Ghost "Filter" button in the header bar; the count shows how many selects narrow the list. */
export function ServicesFilterPopover({
  filter,
  setFilter,
  providerOptions,
  projectOptions,
  typeOptions,
}: ServicesFilterPopoverProps) {
  const { t } = useTranslation();
  const count = [filter.providerUuid, filter.projectUuid, filter.type].filter(
    (v) => v !== undefined,
  ).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconFilter className="size-3.5" />
          {t('common.filter')}
          {count > 0 && <span className="text-ink-3">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="services-filter-provider">{t('services.fieldProvider')}</Label>
          <Select
            value={filter.providerUuid ?? ALL}
            onValueChange={(v) =>
              setFilter((f) => ({ ...f, providerUuid: v === ALL ? undefined : v }))
            }
          >
            <SelectTrigger id="services-filter-provider" className="w-full">
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="services-filter-project">{t('services.fieldProject')}</Label>
          <Select
            value={filter.projectUuid ?? ALL}
            onValueChange={(v) =>
              setFilter((f) => ({ ...f, projectUuid: v === ALL ? undefined : v }))
            }
          >
            <SelectTrigger id="services-filter-project" className="w-full">
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="services-filter-type">{t('services.fieldType')}</Label>
          <Select
            value={filter.type ?? ALL}
            onValueChange={(v) => setFilter((f) => ({ ...f, type: v === ALL ? undefined : v }))}
          >
            <SelectTrigger id="services-filter-type" className="w-full">
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
