import { ProviderIcon } from '@/components/ProviderIcon';

// Provider/project favicon (or colored initial / Tabler icon) + its name. The recurring leading
// cell in the services, payments, projects and dashboard tables.
export function EntityLabel({
  name,
  src,
  iconName,
  iconBg,
  size = 22,
}: {
  name: string;
  src: string | null;
  iconName?: string | null;
  iconBg?: string | null;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <ProviderIcon name={name} src={src} iconName={iconName} iconBg={iconBg} size={size} />
      <span>{name}</span>
    </div>
  );
}
