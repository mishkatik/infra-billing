import type { Icon } from '@tabler/icons-react';
import {
  IconBox,
  IconCloud,
  IconDatabase,
  IconLicense,
  IconNetwork,
  IconServer2,
  IconServerBolt,
  IconWorld,
} from '@tabler/icons-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveLlmVendorIcon } from './llmVendorIcon';

export const LOCATED_TYPES = new Set(['vps', 'dedicated']);

const TYPE_ICONS: Record<string, Icon> = {
  vps: IconServer2,
  dedicated: IconServerBolt,
  domain: IconWorld,
  cdn: IconNetwork,
  storage: IconCloud,
  db: IconDatabase,
  license: IconLicense,
  other: IconBox,
};

function LlmVendorIcon({ model }: { model?: string | null }) {
  const icon = resolveLlmVendorIcon(model);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  if (!icon || failed) {
    return <span className="text-base leading-none">🤖</span>;
  }

  if (icon.mode === 'mono') {
    return (
      <>
        <img
          src={icon.src}
          alt=""
          className="hidden"
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
        />
        {ready ? (
          <span
            aria-hidden
            className={cn(
              'inline-block size-[18px] shrink-0',
              icon.adaptive && 'bg-foreground',
            )}
            style={{
              ...(icon.adaptive ? {} : { backgroundColor: icon.color }),
              WebkitMaskImage: `url(${icon.src})`,
              maskImage: `url(${icon.src})`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
        ) : (
          <span className="inline-block size-[18px] shrink-0" />
        )}
      </>
    );
  }

  return (
    <img
      src={icon.src}
      alt=""
      className="size-[18px] shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function ServiceTypeIcon({ type, model }: { type: string; model?: string | null }) {
  if (type === 'llm') return <LlmVendorIcon model={model} />;
  const Cmp = TYPE_ICONS[type] ?? IconBox;
  return <Cmp size={18} stroke={1.5} className="text-muted-foreground" />;
}

function serviceModelSlug(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const model = (meta as { model?: unknown }).model;
  return typeof model === 'string' ? model : null;
}

export function serviceTypeModel(meta: unknown): string | null {
  return serviceModelSlug(meta);
}
