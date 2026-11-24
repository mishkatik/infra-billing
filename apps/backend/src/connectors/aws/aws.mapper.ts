import type { ResultByTime } from '@aws-sdk/client-cost-explorer';
import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';

export const AWS_CURRENCY = 'USD';

const DAY_MS = 24 * 60 * 60 * 1000;
const SMALLEST_STORED_AMOUNT = new Decimal('0.005');

export interface AwsCostWindow {
  start: Date;
  monthStart: Date;
  end: Date;
  monthEnd: Date;
}

export interface AwsDailyCost {
  day: string;
  service: string;
  amount: Decimal;
  currency: string;
}

interface MonthlySum {
  previous: Decimal;
  current: Decimal;
  currency: string;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function awsCostWindow(now: Date): AwsCostWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    monthStart: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month, now.getUTCDate())),
    monthEnd: new Date(Date.UTC(year, month + 1, 1)),
  };
}

export function awsServiceExternalId(service: string): string {
  return `aws:service:${service}`;
}

export function flattenDailyCosts(results: ResultByTime[], metric: string): AwsDailyCost[] {
  return results.flatMap((r) =>
    (r.Groups ?? []).map((g) => {
      const day = r.TimePeriod?.Start;
      const service = g.Keys?.[0];
      const cost = g.Metrics?.[metric];
      if (!day || !service || !cost?.Amount || !cost.Unit) {
        throw new Error(`AWS: unexpected Cost Explorer row ${JSON.stringify({ day, g })}`);
      }
      return { day, service, amount: new Decimal(cost.Amount), currency: cost.Unit };
    }),
  );
}

function sumByServiceAndMonth(rows: AwsDailyCost[], w: AwsCostWindow): Map<string, MonthlySum> {
  const currentMonthFirstDay = isoDay(w.monthStart);
  const sums = new Map<string, MonthlySum>();
  for (const r of rows) {
    const sum = sums.get(r.service) ?? {
      previous: new Decimal(0),
      current: new Decimal(0),
      currency: r.currency,
    };
    if (r.day < currentMonthFirstDay) sum.previous = sum.previous.plus(r.amount);
    else sum.current = sum.current.plus(r.amount);
    sums.set(r.service, sum);
  }
  return sums;
}

export function mapAwsServices(rows: AwsDailyCost[], w: AwsCostWindow): ServiceData[] {
  const monthMs = w.monthEnd.getTime() - w.monthStart.getTime();
  const elapsedMs = Math.max(w.end.getTime() - w.monthStart.getTime(), DAY_MS);
  const services: ServiceData[] = [];
  for (const [service, s] of sumByServiceAndMonth(rows, w)) {
    if (s.previous.lt(SMALLEST_STORED_AMOUNT) && s.current.lt(SMALLEST_STORED_AMOUNT)) continue;
    services.push({
      externalId: awsServiceExternalId(service),
      name: service,
      type: 'other',
      cost: s.previous.gte(SMALLEST_STORED_AMOUNT)
        ? s.previous
        : s.current.mul(monthMs).div(elapsedMs),
      currency: s.currency,
      period: 'monthly',
      nextBilling: null,
      meta: { lastMonth: s.previous.toFixed(2), monthToDate: s.current.toFixed(2) },
    });
  }
  return services;
}

export function mapAwsPayments(rows: AwsDailyCost[], w: AwsCostWindow): PaymentData[] {
  const months = [
    { key: isoDay(w.start).slice(0, 7), date: w.start, pick: (s: MonthlySum) => s.previous },
    {
      key: isoDay(w.monthStart).slice(0, 7),
      date: w.monthStart,
      pick: (s: MonthlySum) => s.current,
    },
  ];
  const payments: PaymentData[] = [];
  for (const [service, s] of sumByServiceAndMonth(rows, w)) {
    for (const m of months) {
      const amount = m.pick(s);
      if (amount.lt(SMALLEST_STORED_AMOUNT)) continue;
      payments.push({
        externalId: `aws:month:${m.key}:${service}`,
        type: 'charge',
        amount,
        currency: s.currency,
        date: m.date,
        description: `AWS ${service}`,
        serviceExternalId: awsServiceExternalId(service),
      });
    }
  }
  return payments;
}
