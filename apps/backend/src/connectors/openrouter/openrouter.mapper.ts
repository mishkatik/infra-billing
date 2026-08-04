import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import type { OpenRouterActivityItem } from './openrouter.types';

export const OPENROUTER_CURRENCY = 'USD';

export type OpenRouterNameOptions = {
  useCatalogNames: boolean;
};

export function openRouterModelExternalId(model: string): string {
  return `openrouter:model:${model}`;
}

/** Drop leading vendor from catalog (`OpenAI: …`) or slug (`openai/…`) display names. */
export function stripOpenRouterVendorPrefix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const afterColon = trimmed.replace(/^[^:/]+:\s*/, '').trim();
  if (afterColon && afterColon !== trimmed) return afterColon;
  const slash = trimmed.indexOf('/');
  if (slash > 0) {
    const afterSlash = trimmed.slice(slash + 1).trim();
    if (afterSlash) return afterSlash;
  }
  return trimmed;
}

export function formatOpenRouterModelName(
  slug: string,
  namesById: Map<string, string>,
  opts: OpenRouterNameOptions,
): string {
  const name = opts.useCatalogNames ? (namesById.get(slug) || '').trim() || slug : slug;
  return stripOpenRouterVendorPrefix(name);
}

type ModelAgg = {
  model: string;
  providerName?: string;
  requests: number;
  usageWindow: Decimal;
  usageThisMonth: Decimal;
};

export function mapOpenRouterModelServices(
  rows: OpenRouterActivityItem[],
  namesById: Map<string, string> = new Map(),
  opts: OpenRouterNameOptions = { useCatalogNames: true },
): ServiceData[] {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const byModel = new Map<string, ModelAgg>();

  for (const row of rows) {
    const model = (row.model || '').trim();
    if (!model) continue;
    const day = (row.date ?? '').slice(0, 10);
    const usage = new Decimal(String(row.usage ?? 0));
    const requests = row.requests ?? 0;
    let agg = byModel.get(model);
    if (!agg) {
      agg = {
        model,
        providerName: row.provider_name,
        requests: 0,
        usageWindow: new Decimal(0),
        usageThisMonth: new Decimal(0),
      };
      byModel.set(model, agg);
    }
    if (row.provider_name) agg.providerName = row.provider_name;
    agg.requests += requests;
    if (usage.gt(0)) {
      agg.usageWindow = agg.usageWindow.add(usage);
      if (day.startsWith(monthPrefix)) agg.usageThisMonth = agg.usageThisMonth.add(usage);
    }
  }

  return [...byModel.values()]
    .filter((a) => a.usageWindow.gt(0) || a.requests > 0)
    .sort((a, b) => b.usageWindow.cmp(a.usageWindow))
    .map((a) => {
      const cost = a.usageThisMonth.gt(0) ? a.usageThisMonth : a.usageWindow;
      const displayName = formatOpenRouterModelName(a.model, namesById, opts);
      return {
        externalId: openRouterModelExternalId(a.model),
        name: displayName,
        type: 'llm',
        cost,
        currency: OPENROUTER_CURRENCY,
        period: 'monthly',
        nextBilling: null,
        meta: {
          model: a.model,
          displayName,
          providerName: a.providerName ?? null,
          requests: a.requests,
          usageThisMonth: a.usageThisMonth.toFixed(8),
          usageWindow: a.usageWindow.toFixed(8),
        },
      } satisfies ServiceData;
    });
}

export function mapOpenRouterActivityPayments(
  rows: OpenRouterActivityItem[],
  namesById: Map<string, string> = new Map(),
  opts: OpenRouterNameOptions = { useCatalogNames: true },
): PaymentData[] {
  const out: PaymentData[] = [];
  for (const row of rows) {
    const model = (row.model || '').trim();
    const day = (row.date ?? '').slice(0, 10);
    if (!model || !day || row.usage == null) continue;
    const amount = new Decimal(String(row.usage));
    if (amount.lte(0)) continue;
    out.push({
      externalId: `or:${day}:${model}`,
      type: 'charge',
      amount,
      currency: OPENROUTER_CURRENCY,
      date: new Date(`${day}T00:00:00Z`),
      description: formatOpenRouterModelName(model, namesById, opts),
      serviceExternalId: openRouterModelExternalId(model),
    });
  }
  return out;
}
