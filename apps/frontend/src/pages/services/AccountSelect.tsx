import type { Provider, ProviderAccount } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const accountsOf = (providers: Provider[] | undefined, providerUuid: string) =>
  providers?.find((p) => p.uuid === providerUuid)?.accounts ?? [];

/** The account a freshly picked provider implies: its only one, or none when there are several. */
export const impliedAccount = (accounts: ProviderAccount[]) =>
  accounts.length === 1 ? accounts[0].uuid : '';

interface AccountSelectProps {
  id: string;
  label: string;
  accounts: ProviderAccount[];
  value: string;
  onChange: (uuid: string) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Account picker for service and payment forms. Rendered only for providers with several
 * accounts; a single-account provider fills the field silently.
 */
export function AccountSelect({
  id,
  label,
  accounts,
  value,
  onChange,
  disabled,
  error,
  className = 'space-y-2',
}: AccountSelectProps) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder={t('validation.selectAccount')} />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.uuid} value={a.uuid}>
              {a.label ?? t('common.accountMain')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
