import { IconFingerprint, IconLoader2, IconPassword } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MethodRow } from './MethodRow';

export interface MethodsFormValues {
  passwordEnabled: boolean;
  passkeyEnabled: boolean;
  rpId: string;
  rpName: string;
  rpOrigin: string;
}

interface AuthMethodsCardProps {
  form: UseFormReturn<MethodsFormValues>;
  pkOpen: boolean;
  onTogglePk: () => void;
  onUseCurrentHost: () => void;
  onSave: () => void;
  saving: boolean;
}

// Password is a plain on/off toggle; passkey expands to its WebAuthn relying-party settings.
export function AuthMethodsCard({
  form,
  pkOpen,
  onTogglePk,
  onUseCurrentHost,
  onSave,
  saving,
}: AuthMethodsCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('auth.methods.title')} />

      <CardContent className="py-1">
        <Controller
          control={form.control}
          name="passwordEnabled"
          render={({ field }) => (
            <MethodRow
              icon={IconPassword}
              title={t('auth.methods.password')}
              description={t('auth.methods.passwordDescription')}
              enabled={field.value}
              onToggle={field.onChange}
            />
          )}
        />
      </CardContent>

      <Separator className="bg-hairline" />

      <CardContent className="py-1">
        <Controller
          control={form.control}
          name="passkeyEnabled"
          render={({ field }) => (
            <MethodRow
              icon={IconFingerprint}
              title={t('auth.methods.passkey')}
              description={t('auth.methods.passkeyDescription')}
              enabled={field.value}
              onToggle={field.onChange}
              opened={pkOpen}
              onToggleOpen={onTogglePk}
            >
              <div className="space-y-4">
                <Alert>
                  <InkGlyph state="warn" />
                  <AlertDescription className="text-foreground">
                    {t('auth.methods.warning')}
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-rp-id">{t('auth.methods.rpId')}</Label>
                  <p className="text-[13px] text-ink-2">{t('auth.methods.rpIdDescription')}</p>
                  <Input id="auth-rp-id" placeholder="example.com" {...form.register('rpId')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-rp-name">{t('auth.methods.rpName')}</Label>
                  <Input
                    id="auth-rp-name"
                    placeholder="Infra Billing"
                    {...form.register('rpName')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-rp-origin">{t('auth.methods.rpOrigin')}</Label>
                  <p className="text-[13px] text-ink-2">{t('auth.methods.rpOriginDescription')}</p>
                  <Input
                    id="auth-rp-origin"
                    placeholder="https://example.com"
                    {...form.register('rpOrigin')}
                  />
                </div>
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={onUseCurrentHost}>
                    {t('auth.methods.useCurrent')}
                  </Button>
                </div>
              </div>
            </MethodRow>
          )}
        />
      </CardContent>

      <CardContent className="flex justify-end border-t border-hairline py-4">
        <Button onClick={onSave} disabled={saving}>
          {saving && <IconLoader2 className="size-4 animate-spin" />}
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
