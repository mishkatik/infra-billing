import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** The product name as a plain wordmark. */
export function BrandWordmark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('truncate text-[15px] font-medium', className)}>{t('app.brand')}</span>
  );
}
