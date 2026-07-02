import { ProviderIcon } from '@/components/ProviderIcon';

// Provider/project favicon (or colored initial) + its name. The recurring leading cell in the
// services, payments, projects and dashboard tables.
export function EntityLabel({
  name,
  src,
  size = 22,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <ProviderIcon name={name} src={src} size={size} />
      <span>{name}</span>
    </div>
  );
}
