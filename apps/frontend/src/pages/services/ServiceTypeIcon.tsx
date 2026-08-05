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
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ServiceMarkerPreview } from './ServiceMarkerField';
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

function IconSlot({ size, children }: { size: number; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center self-center"
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

function LlmVendorIcon({ model, size }: { model?: string | null; size: number }) {
  const icon = resolveLlmVendorIcon(model);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  if (!icon || failed) {
    return (
      <IconSlot size={size}>
        <span className="leading-none" style={{ fontSize: Math.round(size * 0.85) }}>
          🤖
        </span>
      </IconSlot>
    );
  }

  if (icon.mode === 'mono') {
    return (
      <IconSlot size={size}>
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
            className={cn('block size-full', icon.adaptive && 'bg-foreground')}
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
        ) : null}
      </IconSlot>
    );
  }

  return (
    <IconSlot size={size}>
      <img
        src={icon.src}
        alt=""
        className="block size-full object-contain"
        onError={() => setFailed(true)}
      />
    </IconSlot>
  );
}

export function ServiceTypeIcon({
  type,
  model,
  marker,
  markerBg,
  size = 18,
}: {
  type: string;
  model?: string | null;
  marker?: string | null;
  markerBg?: string | null;
  size?: number;
}) {
  if (type === 'llm') return <LlmVendorIcon model={model} size={size} />;
  if (marker) return <ServiceMarkerPreview marker={marker} markerBg={markerBg} size={size} />;
  const Cmp = TYPE_ICONS[type] ?? IconBox;
  return (
    <IconSlot size={size}>
      <Cmp
        size={Math.max(12, Math.round(size * 0.9))}
        stroke={1.5}
        className="block text-muted-foreground"
      />
    </IconSlot>
  );
}

function metaField(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

export function serviceTypeModel(meta: unknown): string | null {
  return metaField(meta, 'vendor') ?? metaField(meta, 'model');
}

export function serviceTypeMarker(meta: unknown): string | null {
  return metaField(meta, 'marker');
}

export function serviceTypeMarkerBg(meta: unknown): string | null {
  return metaField(meta, 'markerBg');
}
