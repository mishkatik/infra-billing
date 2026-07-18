import { Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { AnalyticsSummary, BalancePoint, ForecastPoint, Period, ProjectStats } from '@infra/shared';
import { BalanceSnapshotsRepository } from '@repositories/balance-snapshots/balance-snapshots.repository';
import { PaymentsRepository } from '@repositories/payments/payments.repository';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { CurrencyService } from '../currency/currency.service';
import { monthlyCost } from '@common/money';
import { overdueDays } from '@common/overdue';
import { burnFromMonthlyCost, burnFromSnapshots, daysOfRunway } from '@common/runway';

const ZERO = () => new Decimal(0);

interface Agg {
  monthly: Decimal;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly providersRepo: ProvidersRepository,
    private readonly projectsRepo: ProjectsRepository,
    private readonly servicesRepo: ServicesRepository,
    private readonly paymentsRepo: PaymentsRepository,
    private readonly snapshotsRepo: BalanceSnapshotsRepository,
    private readonly currency: CurrencyService,
  ) {}

  async summary(): Promise<AnalyticsSummary> {
    const { baseCurrency } = await this.currency.getEffectiveSettings();
    const rates = await this.currency.getRubRates();

    const [providers, projects, services, payments] = await Promise.all([
      this.providersRepo.listAll(),
      this.projectsRepo.listAll(),
      this.servicesRepo.listActive(),
      this.paymentsRepo.listAll(),
    ]);
    const providerName = new Map(providers.map((p) => [p.uuid, p.name]));
    const providerByUuid = new Map(providers.map((p) => [p.uuid, p]));

    let monthlyTotal = ZERO();
    const byProvider = new Map<string, Agg>();
    const byProject = new Map<string, Agg>();
    const byCountry = new Map<string, Agg>();
    const byType = new Map<string, Agg>();
    const byCurrency = new Map<string, { original: Decimal; base: Decimal; count: number }>();

    for (const s of services) {
      const monthlyOrig = monthlyCost(new Decimal(s.cost.toString()), s.period as Period);
      const monthlyBase = this.currency.convert(monthlyOrig, s.currency, baseCurrency, rates);
      monthlyTotal = monthlyTotal.add(monthlyBase);
      bump(byProvider, s.providerUuid, monthlyBase);
      bump(byProject, s.projectUuid, monthlyBase);
      bump(byCountry, s.countryCode ?? 'XX', monthlyBase);
      bump(byType, s.type, monthlyBase);
      const c = byCurrency.get(s.currency) ?? { original: ZERO(), base: ZERO(), count: 0 };
      c.original = c.original.add(monthlyOrig);
      c.base = c.base.add(monthlyBase);
      c.count += 1;
      byCurrency.set(s.currency, c);
    }

    const now = dayjs();
    const monthStart = now.startOf('month');
    const monthEnd = now.endOf('month');
    let currentMonthPayments = ZERO();
    let totalSpent = ZERO();
    const spentByProvider = new Map<string, Decimal>();
    // Providers that expose top-ups (BILLmanager, Timeweb…): their spend is the top-ups, and their
    // `charge` rows are just per-service detail. Consumption-only providers (Yandex, Selectel) have
    // no top-ups, so their charges ARE the spend and can be counted without double-counting.
    const providersWithTopups = new Set(
      payments.filter((p) => p.type !== 'charge').map((p) => p.providerUuid),
    );
    for (const p of payments) {
      if (p.type === 'charge' && providersWithTopups.has(p.providerUuid)) continue;
      const base = this.currency.convert(
        new Decimal(p.amount.toString()),
        p.currency,
        baseCurrency,
        rates,
      );
      totalSpent = totalSpent.add(base);
      spentByProvider.set(
        p.providerUuid,
        (spentByProvider.get(p.providerUuid) ?? ZERO()).add(base),
      );
      const pd = dayjs(p.paymentDate);
      if (!pd.isBefore(monthStart) && !pd.isAfter(monthEnd)) {
        currentMonthPayments = currentMonthPayments.add(base);
      }
    }

    const horizon = now.add(14, 'day');
    const today = now.startOf('day');
    // Services billing within 14 days, sorted soonest-first.
    const upcomingSorted = services
      .filter(
        (s) =>
          s.nextBillingAt &&
          dayjs(s.nextBillingAt).isAfter(now) &&
          dayjs(s.nextBillingAt).isBefore(horizon),
      )
      .map((s) => ({
        s,
        date: dayjs(s.nextBillingAt!),
        costBase: this.currency.convert(
          new Decimal(s.cost.toString()),
          s.currency,
          baseCurrency,
          rates,
        ),
      }))
      .sort((a, b) => a.date.valueOf() - b.date.valueOf());

    // Running balance per provider (base currency); charges deplete it in date order, so once a
    // provider's funds run out the later charges in the window are flagged uncovered.
    const runningBalance = new Map<string, Decimal | null>();
    for (const p of providers) {
      runningBalance.set(
        p.uuid,
        // Postpaid providers (invoice-billed) carry no prepaid funds → balance is unknown here.
        p.balance != null && p.balanceCurrency && !p.isPostpaid
          ? this.currency.convert(
              new Decimal(p.balance.toString()),
              p.balanceCurrency,
              baseCurrency,
              rates,
            )
          : null,
      );
    }

    const upcomingBillings = upcomingSorted.map(({ s, date, costBase }) => {
      const bal = runningBalance.get(s.providerUuid) ?? null;
      let covered: boolean | null;
      if (bal == null) {
        covered = null; // provider has no balance API → unknown
      } else {
        covered = bal.gte(costBase);
        runningBalance.set(s.providerUuid, bal.sub(costBase));
      }
      const daysUntil = Math.max(0, date.startOf('day').diff(today, 'day'));
      let severity: 'critical' | 'warning' | 'ok';
      if (covered === false && daysUntil <= 7) severity = 'critical';
      else if (covered === false || daysUntil <= 3) severity = 'warning';
      else severity = 'ok';
      const provider = providerByUuid.get(s.providerUuid);
      return {
        serviceUuid: s.uuid,
        name: s.name,
        providerName: providerName.get(s.providerUuid) ?? '',
        providerLoginUrl: provider?.loginUrl ?? null,
        nextBillingAt: s.nextBillingAt!.toISOString(),
        cost: new Decimal(s.cost.toString()).toFixed(2),
        currency: s.currency,
        costBase: costBase.toFixed(2),
        daysUntil,
        providerBalance: provider?.balance != null ? provider.balance.toFixed(2) : null,
        providerBalanceCurrency: provider?.balanceCurrency ?? null,
        covered,
        severity,
      };
    });

    // Dated charges already in the past: pay-or-fix reminders, most overdue first.
    const overdueBillings: AnalyticsSummary['overdueBillings'] = [];
    for (const s of services) {
      const daysOverdue = overdueDays(s.nextBillingAt, now);
      if (daysOverdue == null) continue;
      const provider = providerByUuid.get(s.providerUuid);
      overdueBillings.push({
        serviceUuid: s.uuid,
        name: s.name,
        providerName: providerName.get(s.providerUuid) ?? '',
        providerLoginUrl: provider?.loginUrl ?? null,
        nextBillingAt: s.nextBillingAt!.toISOString(),
        cost: new Decimal(s.cost.toString()).toFixed(2),
        currency: s.currency,
        costBase: this.currency
          .convert(new Decimal(s.cost.toString()), s.currency, baseCurrency, rates)
          .toFixed(2),
        daysOverdue,
      });
    }
    overdueBillings.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Balance runway: prepaid providers with a draining balance but no upcoming dated charge.
    // Estimate days-left from snapshot decline (fallback: monthly service cost), and reuse the
    // charge-coverage severity model. A provider with any dated service is governed by the dated
    // logic above (even if the date is beyond the upcoming window), so it's not a runway candidate.
    const datedProviderUuids = new Set(
      services.filter((s) => s.nextBillingAt != null).map((s) => s.providerUuid),
    );
    const runwayWindowStart = now.subtract(30, 'day').toDate();
    const snapshots = await this.snapshotsRepo.listSince(runwayWindowStart);
    const snapsByProvider = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      const list = snapsByProvider.get(snap.providerUuid);
      if (list) list.push(snap);
      else snapsByProvider.set(snap.providerUuid, [snap]);
    }

    const balanceRunway: AnalyticsSummary['balanceRunway'] = [];
    for (const p of providers) {
      if (p.balance == null || !p.balanceCurrency) continue;
      if (p.isPostpaid) continue; // invoice-billed → balance isn't prepaid funds
      if (datedProviderUuids.has(p.uuid)) continue;
      const balance = new Decimal(p.balance.toString());

      // Primary: actual decline measured from snapshots (in the provider's balance currency).
      const points = (snapsByProvider.get(p.uuid) ?? [])
        .filter((snap) => snap.currency === p.balanceCurrency)
        .map((snap) => ({
          balance: new Decimal(snap.balance.toString()),
          capturedAt: snap.capturedAt,
        }));
      let burn = burnFromSnapshots(points);
      let basis: 'snapshots' | 'services' = 'snapshots';
      if (burn == null) {
        // Fallback: sum the provider's active services' monthly cost in the balance currency.
        let monthly = ZERO();
        for (const s of services) {
          if (s.providerUuid !== p.uuid) continue;
          monthly = monthly.add(
            this.currency.convert(
              monthlyCost(new Decimal(s.cost.toString()), s.period as Period),
              s.currency,
              p.balanceCurrency,
              rates,
            ),
          );
        }
        burn = burnFromMonthlyCost(monthly);
        basis = 'services';
      }
      if (burn == null) continue; // no measurable spend → can't estimate

      const daysLeft = daysOfRunway(balance, burn);
      let severity: 'critical' | 'warning' | 'ok';
      if (daysLeft <= 3) severity = 'critical';
      else if (daysLeft <= 7) severity = 'warning';
      else severity = 'ok';
      if (severity === 'ok') continue; // > 7 days of runway → not surfaced

      balanceRunway.push({
        providerUuid: p.uuid,
        providerName: p.name,
        providerLoginUrl: p.loginUrl ?? null,
        balance: balance.toFixed(2),
        currency: p.balanceCurrency,
        burnPerDay: burn.toFixed(2),
        daysLeft,
        depletionAt: now.add(daysLeft, 'day').toISOString(),
        basis,
        severity,
      });
    }
    balanceRunway.sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      baseCurrency,
      monthlyTotal: monthlyTotal.toFixed(2),
      yearlyProjection: monthlyTotal.mul(12).toFixed(2),
      currentMonthPayments: currentMonthPayments.toFixed(2),
      totalSpent: totalSpent.toFixed(2),
      byProvider: providers.map((p) => ({
        providerUuid: p.uuid,
        name: p.name,
        monthlyCost: (byProvider.get(p.uuid)?.monthly ?? ZERO()).toFixed(2),
        spent: (spentByProvider.get(p.uuid) ?? ZERO()).toFixed(2),
        balance: p.balance ? p.balance.toFixed(2) : null,
        balanceCurrency: p.balanceCurrency,
        servicesCount: byProvider.get(p.uuid)?.count ?? 0,
      })),
      byProject: projects.map((p) => ({
        projectUuid: p.uuid,
        name: p.name,
        monthlyCost: (byProject.get(p.uuid)?.monthly ?? ZERO()).toFixed(2),
        servicesCount: byProject.get(p.uuid)?.count ?? 0,
      })),
      byCountry: [...byCountry].map(([countryCode, v]) => ({
        countryCode,
        monthlyCost: v.monthly.toFixed(2),
        servicesCount: v.count,
      })),
      byType: [...byType].map(([type, v]) => ({
        type,
        monthlyCost: v.monthly.toFixed(2),
        servicesCount: v.count,
      })),
      byCurrency: [...byCurrency].map(([currency, v]) => ({
        currency,
        monthlyCostOriginal: v.original.toFixed(2),
        monthlyCostBase: v.base.toFixed(2),
        servicesCount: v.count,
      })),
      upcomingBillings,
      overdueBillings,
      balanceRunway,
    };
  }

  /** Cost statistics for a single project (active services only), in the base currency. */
  async projectStats(projectUuid: string): Promise<ProjectStats> {
    const project = await this.projectsRepo.findByUuid(projectUuid);
    if (!project) throw new NotFoundException('Project not found');

    const { baseCurrency } = await this.currency.getEffectiveSettings();
    const rates = await this.currency.getRubRates();
    const [providers, services] = await Promise.all([
      this.providersRepo.listAll(),
      this.servicesRepo.listActiveByProject(projectUuid),
    ]);
    const providerName = new Map(providers.map((p) => [p.uuid, p.name]));

    let monthlyTotal = ZERO();
    const byProvider = new Map<string, Agg>();
    const byCountry = new Map<string, Agg>();
    const byType = new Map<string, Agg>();
    for (const s of services) {
      const monthlyBase = this.currency.convert(
        monthlyCost(new Decimal(s.cost.toString()), s.period as Period),
        s.currency,
        baseCurrency,
        rates,
      );
      monthlyTotal = monthlyTotal.add(monthlyBase);
      bump(byProvider, s.providerUuid, monthlyBase);
      bump(byCountry, s.countryCode ?? 'XX', monthlyBase);
      bump(byType, s.type, monthlyBase);
    }

    return {
      projectUuid: project.uuid,
      name: project.name,
      baseCurrency,
      monthlyTotal: monthlyTotal.toFixed(2),
      yearlyProjection: monthlyTotal.mul(12).toFixed(2),
      servicesCount: services.length,
      byType: [...byType].map(([type, v]) => ({
        type,
        monthlyCost: v.monthly.toFixed(2),
        servicesCount: v.count,
      })),
      byCountry: [...byCountry].map(([countryCode, v]) => ({
        countryCode,
        monthlyCost: v.monthly.toFixed(2),
        servicesCount: v.count,
      })),
      byProvider: [...byProvider].map(([providerUuid, v]) => ({
        providerUuid,
        name: providerName.get(providerUuid) ?? '',
        monthlyCost: v.monthly.toFixed(2),
        servicesCount: v.count,
      })),
    };
  }

  async forecast(months: number, monthsBack: number): Promise<ForecastPoint[]> {
    const { baseCurrency } = await this.currency.getEffectiveSettings();
    const rates = await this.currency.getRubRates();

    const current = dayjs().startOf('month');
    const currentKey = current.format('YYYY-MM');
    const windowStart = current.subtract(monthsBack, 'month');
    const totalMonths = monthsBack + 1 + months; // past + current + future

    const monthsList: string[] = [];
    const actualBuckets = new Map<string, Decimal>();
    const projBuckets = new Map<string, Decimal>();
    for (let i = 0; i < totalMonths; i += 1) {
      const key = windowStart.add(i, 'month').format('YYYY-MM');
      monthsList.push(key);
      actualBuckets.set(key, ZERO());
      projBuckets.set(key, ZERO());
    }

    // Actuals: top-ups + manual payments, plus charges for consumption-only providers (no top-ups).
    // Same definition as currentMonthPayments/totalSpent in summary() — keeps "Actual" consistent
    // with the KPI card.
    const [payments, topupProviderUuids] = await Promise.all([
      this.paymentsRepo.listSince(windowStart.toDate()),
      this.paymentsRepo.providerUuidsWithTopups(),
    ]);
    const providersWithTopups = new Set(topupProviderUuids);
    for (const p of payments) {
      if (p.type === 'charge' && providersWithTopups.has(p.providerUuid)) continue;
      const key = dayjs(p.paymentDate).format('YYYY-MM');
      if (!actualBuckets.has(key) || key > currentKey) continue; // future-dated payments ignored
      const base = this.currency.convert(
        new Decimal(p.amount.toString()),
        p.currency,
        baseCurrency,
        rates,
      );
      actualBuckets.set(key, actualBuckets.get(key)!.add(base));
    }

    // Projection: recurring services billed strictly in the future (current month shows actuals only).
    const services = await this.servicesRepo.listActiveBilled();
    const projStart = current.add(1, 'month');
    const projEnd = current.add(months + 1, 'month');
    for (const s of services) {
      const charge = this.currency.convert(
        new Decimal(s.cost.toString()),
        s.currency,
        baseCurrency,
        rates,
      );
      const step = periodStep(s.period);
      let d = dayjs(s.nextBillingAt!);
      if (!step) {
        const key = d.format('YYYY-MM');
        if (projBuckets.has(key) && !d.isBefore(projStart)) {
          projBuckets.set(key, projBuckets.get(key)!.add(charge));
        }
        continue;
      }
      let guard = 0;
      while (d.isBefore(projStart) && guard < 5000) {
        d = d.add(step.n, step.u);
        guard += 1;
      }
      guard = 0;
      while (d.isBefore(projEnd) && guard < 5000) {
        const key = d.format('YYYY-MM');
        if (projBuckets.has(key)) projBuckets.set(key, projBuckets.get(key)!.add(charge));
        d = d.add(step.n, step.u);
        guard += 1;
      }
    }

    return monthsList.map((m) => ({
      month: m,
      actual: actualBuckets.get(m)!.toFixed(2),
      projected: projBuckets.get(m)!.toFixed(2),
    }));
  }

  async balanceHistory(uuid: string, from?: Date, to?: Date): Promise<BalancePoint[]> {
    const rows = await this.snapshotsRepo.listForProvider(uuid, from, to);
    return rows.map((r) => ({
      balance: r.balance.toFixed(2),
      currency: r.currency,
      capturedAt: r.capturedAt.toISOString(),
    }));
  }
}

function bump(map: Map<string, Agg>, key: string, amount: Decimal): void {
  const cur = map.get(key) ?? { monthly: new Decimal(0), count: 0 };
  cur.monthly = cur.monthly.add(amount);
  cur.count += 1;
  map.set(key, cur);
}

function periodStep(period: string): { n: number; u: dayjs.ManipulateType } | null {
  switch (period) {
    case 'monthly':
    case 'hourly':
      return { n: 1, u: 'month' };
    case 'quarterly':
      return { n: 3, u: 'month' };
    case 'daily':
      return { n: 1, u: 'day' };
    case 'yearly':
      return { n: 1, u: 'year' };
    case 'onetime':
      return null;
    default:
      return { n: 1, u: 'month' };
  }
}
