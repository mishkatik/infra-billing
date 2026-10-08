import { Loader2Icon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { useTheme } from '@/lib/theme';

// Quiet toasts: a white card lifted by a soft shadow, no border. The status dot carries the tone;
// an error also tints its title.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme();

  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <InkGlyph state="ok" size={13} />,
        info: <InkGlyph state="pending" size={13} />,
        warning: <InkGlyph state="warn" size={13} />,
        error: <InkGlyph state="failed" size={13} />,
        loading: <Loader2Icon className="size-4 animate-spin text-ink-3" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'font-sans !rounded-xl !border-0 !shadow-md',
          title: 'font-medium',
          description: '!text-ink-2',
          error: '[&_[data-title]]:text-destructive',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'transparent',
          '--border-radius': 'var(--radius-xl)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
