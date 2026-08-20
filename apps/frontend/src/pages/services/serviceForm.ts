import type { ServiceClientMeta } from '@infra/shared';
import { LOCATED_TYPES } from './ServiceTypeIcon';

export interface SForm {
  providerUuid: string;
  projectUuid: string;
  name: string;
  description: string;
  type: string;
  cost: string;
  currency: string;
  period: string;
  countryCode: string;
  vendor: string;
  marker: string;
  markerBg: string;
  nextBillingAt: string;
}

export const toIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

export function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === 'string' ? v : '';
}

export function clientMetaFromForm(v: SForm): ServiceClientMeta {
  if (LOCATED_TYPES.has(v.type)) {
    return { vendor: null, marker: null, markerBg: null };
  }
  if (v.type === 'llm') {
    return { vendor: v.vendor.trim() || null, marker: null, markerBg: null };
  }
  const marker = v.marker.trim();
  return {
    vendor: null,
    marker: marker || null,
    markerBg: marker ? v.markerBg.trim() || null : null,
  };
}
