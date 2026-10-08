import { z } from 'zod';
import {
  currencySchema,
  isoDateSchema,
  moneyAmountSchema,
  moneySchema,
  uuidSchema,
} from './common';

export const byProviderSchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  name: z.string().describe('Provider name'),
  monthlyCost: moneySchema.describe('Monthly cost in base currency'),
  // Total paid out to this provider (top-ups + manual payments) in base currency.
  spent: moneySchema.describe('Total spent in base currency'),
  // The provider's account balances summed per currency (empty when none is known).
  balances: z.array(moneyAmountSchema).describe('Balance per currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

export const byCountrySchema = z.object({
  countryCode: z.string().describe('ISO country code'),
  monthlyCost: moneySchema.describe('Monthly cost in base currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

export const byTypeSchema = z.object({
  type: z.string().describe('Service type'),
  monthlyCost: moneySchema.describe('Monthly cost in base currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

export const byProjectSchema = z.object({
  projectUuid: uuidSchema.describe('Project UUID'),
  name: z.string().describe('Project name'),
  monthlyCost: moneySchema.describe('Monthly cost in base currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

/** A provider's contribution within a single project (no balance/spend; those are account-level). */
export const projectProviderStatSchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  name: z.string().describe('Provider name'),
  monthlyCost: moneySchema.describe('Monthly cost in base currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

/** Cost statistics for a single project (active services only), in the base currency. */
export const projectStatsSchema = z.object({
  projectUuid: uuidSchema.describe('Project UUID'),
  name: z.string().describe('Project name'),
  baseCurrency: currencySchema.describe('Base currency code'),
  monthlyTotal: moneySchema.describe('Total monthly cost'),
  yearlyProjection: moneySchema.describe('Projected yearly cost'),
  servicesCount: z.number().int().describe('Number of active services'),
  byType: z.array(byTypeSchema).describe('Breakdown by service type'),
  byCountry: z.array(byCountrySchema).describe('Breakdown by country'),
  byProvider: z.array(projectProviderStatSchema).describe('Breakdown by provider'),
});
export type ProjectStats = z.infer<typeof projectStatsSchema>;

export const byCurrencySchema = z.object({
  currency: currencySchema.describe('Currency code'),
  monthlyCostOriginal: moneySchema.describe('Monthly cost in original currency'),
  monthlyCostBase: moneySchema.describe('Monthly cost in base currency'),
  servicesCount: z.number().int().describe('Number of services'),
});

/**
 * critical = imminent (≤7d) charge that is uncovered — or has unknown coverage on a non-postpaid
 * provider; warning = very soon / underfunded. Consumers tell "insufficient" from "unknown"
 * via `covered`.
 */
export const billingSeveritySchema = z.enum(['critical', 'warning', 'ok']);
export type BillingSeverity = z.infer<typeof billingSeveritySchema>;

export const upcomingBillingSchema = z.object({
  serviceUuid: uuidSchema.describe('Service UUID'),
  name: z.string().describe('Service name'),
  providerUuid: uuidSchema.describe('Provider UUID'),
  providerName: z.string().describe('Provider name'),
  accountUuid: uuidSchema.describe('Provider account UUID'),
  // Set only when the provider has several accounts, so a row can say which one; null otherwise
  // (and for a provider's original, unlabelled account).
  accountLabel: z
    .string()
    .describe(
      'Account label, set only when the provider has several accounts; empty for its original unlabelled account',
    )
    .nullable(),
  providerKind: z.string().describe('Provider connector kind'),
  // Provider cabinet link (loginUrl), used to deeplink the provider in Telegram alerts.
  providerLoginUrl: z.string().describe('Provider cabinet link').nullable(),
  providerFaviconLink: z.string().describe('Provider favicon URL').nullable(),
  providerIconName: z.string().describe('Provider Tabler icon name').nullable(),
  providerIconBg: z.string().describe('Provider icon tile background').nullable(),
  type: z.string().describe('Service type'),
  countryCode: z.string().describe('Service country code').nullable(),
  marker: z.string().describe('Custom type marker').nullable(),
  markerBg: z.string().describe('Custom type marker color').nullable(),
  vendor: z.string().describe('LLM vendor slug').nullable(),
  nextBillingAt: isoDateSchema.describe('Next billing date'),
  cost: moneySchema.describe('Cost in service currency'),
  currency: currencySchema.describe('Service currency'),
  costBase: moneySchema.describe('Cost in base currency'),
  daysUntil: z.number().int().describe('Days until billing (0 = today)'),
  accountBalance: moneySchema.describe('Account balance').nullable(),
  accountBalanceCurrency: currencySchema.describe('Account balance currency').nullable(),
  // null = the account exposes no balance (manual kind, Hetzner-class connectors) → coverage
  // unknown; unknown + due ≤7d on a non-postpaid account is still critical.
  covered: z.boolean().describe('Balance covers charge').nullable(),
  severity: billingSeveritySchema.describe('Billing severity level'),
});

/**
 * How much to top up a prepaid account so the upcoming 14-day charges fit its balance.
 * Amount is in the account's balance currency (after simulating charges in date order).
 */
export const balanceTopUpSchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  providerName: z.string().describe('Provider name'),
  accountUuid: uuidSchema.describe('Provider account UUID'),
  // Set only when the provider has several accounts, so a row can say which one; null otherwise
  // (and for a provider's original, unlabelled account).
  accountLabel: z
    .string()
    .describe(
      'Account label, set only when the provider has several accounts; empty for its original unlabelled account',
    )
    .nullable(),
  providerKind: z.string().describe('Provider connector kind'),
  providerLoginUrl: z.string().describe('Provider cabinet link').nullable(),
  providerFaviconLink: z.string().describe('Provider favicon URL').nullable(),
  providerIconName: z.string().describe('Provider Tabler icon name').nullable(),
  providerIconBg: z.string().describe('Provider icon tile background').nullable(),
  amount: moneySchema.describe('Suggested top-up amount'),
  currency: currencySchema.describe('Balance / top-up currency'),
});
export type BalanceTopUp = z.infer<typeof balanceTopUpSchema>;

/** A dated charge whose billing day is already behind us — needs payment or a billing-date refresh. */
export const overdueBillingSchema = z.object({
  serviceUuid: uuidSchema.describe('Service UUID'),
  name: z.string().describe('Service name'),
  providerUuid: uuidSchema.describe('Provider UUID'),
  providerName: z.string().describe('Provider name'),
  accountUuid: uuidSchema.describe('Provider account UUID'),
  // Set only when the provider has several accounts, so a row can say which one; null otherwise
  // (and for a provider's original, unlabelled account).
  accountLabel: z
    .string()
    .describe(
      'Account label, set only when the provider has several accounts; empty for its original unlabelled account',
    )
    .nullable(),
  providerKind: z.string().describe('Provider connector kind'),
  providerLoginUrl: z.string().describe('Provider cabinet link').nullable(),
  providerFaviconLink: z.string().describe('Provider favicon URL').nullable(),
  providerIconName: z.string().describe('Provider Tabler icon name').nullable(),
  providerIconBg: z.string().describe('Provider icon tile background').nullable(),
  type: z.string().describe('Service type'),
  countryCode: z.string().describe('Service country code').nullable(),
  marker: z.string().describe('Custom type marker').nullable(),
  markerBg: z.string().describe('Custom type marker color').nullable(),
  vendor: z.string().describe('LLM vendor slug').nullable(),
  nextBillingAt: isoDateSchema.describe('Missed billing date'),
  cost: moneySchema.describe('Cost in service currency'),
  currency: currencySchema.describe('Service currency'),
  costBase: moneySchema.describe('Cost in base currency'),
  // >= 1 by construction: the cut is the calendar day, a charge dated today is still upcoming.
  daysOverdue: z.number().int().positive().describe('Whole calendar days past due (1 = yesterday)'),
});

/**
 * Estimated balance depletion for a prepaid account that has no upcoming dated charge.
 * Burn rate is inferred from balance-snapshot decline (or, with too little history, the sum of
 * the account's services' monthly cost). All money is in the account's own balance currency.
 */
export const balanceRunwaySchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  providerName: z.string().describe('Provider name'),
  accountUuid: uuidSchema.describe('Provider account UUID'),
  // Set only when the provider has several accounts, so a row can say which one; null otherwise
  // (and for a provider's original, unlabelled account).
  accountLabel: z
    .string()
    .describe(
      'Account label, set only when the provider has several accounts; empty for its original unlabelled account',
    )
    .nullable(),
  providerKind: z.string().describe('Provider connector kind'),
  providerLoginUrl: z.string().describe('Provider cabinet link').nullable(),
  providerFaviconLink: z.string().describe('Provider favicon URL').nullable(),
  providerIconName: z.string().describe('Provider Tabler icon name').nullable(),
  providerIconBg: z.string().describe('Provider icon tile background').nullable(),
  balance: moneySchema.describe('Current balance'),
  currency: currencySchema.describe('Balance currency'),
  burnPerDay: moneySchema.describe('Estimated daily spend in balance currency'),
  daysLeft: z.number().int().describe('Estimated whole days until depletion'),
  depletionAt: isoDateSchema.describe('Estimated depletion date'),
  // How the burn rate was derived: actual snapshot decline, or service monthly cost.
  basis: z.enum(['snapshots', 'services']).describe('Burn-rate basis'),
  severity: billingSeveritySchema.describe('Runway severity level'),
});
export type BalanceRunway = z.infer<typeof balanceRunwaySchema>;

export const analyticsSummarySchema = z.object({
  baseCurrency: currencySchema.describe('Base currency code'),
  monthlyTotal: moneySchema.describe('Total monthly cost'),
  yearlyProjection: moneySchema.describe('Projected yearly cost'),
  currentMonthPayments: moneySchema.describe('Payments this month'),
  totalSpent: moneySchema.describe('Total spent overall'),
  byProvider: z.array(byProviderSchema).describe('Breakdown by provider'),
  byProject: z.array(byProjectSchema).describe('Breakdown by project'),
  byCountry: z.array(byCountrySchema).describe('Breakdown by country'),
  byType: z.array(byTypeSchema).describe('Breakdown by service type'),
  byCurrency: z.array(byCurrencySchema).describe('Breakdown by currency'),
  upcomingBillings: z.array(upcomingBillingSchema).describe('Upcoming billings'),
  overdueBillings: z
    .array(overdueBillingSchema)
    .describe('Billings already past due, most overdue first'),
  // Prepaid providers (no dated charge) whose balance is estimated to run out soon.
  balanceRunway: z.array(balanceRunwaySchema).describe('Estimated balance runway'),
  // Top-up needed so prepaid balance covers upcoming dated charges (14-day window).
  balanceTopUps: z.array(balanceTopUpSchema).describe('Suggested provider top-ups'),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

export const forecastPointSchema = z.object({
  month: z.string().describe('Month'),
  projected: moneySchema.describe('Projected cost (future months)'),
  actual: moneySchema.describe('Actual charges (past/current months)'),
  estimated: moneySchema.describe(
    'Tariff backfill for past/current months (providers without payment history, or force mode)',
  ),
});
export type ForecastPoint = z.infer<typeof forecastPointSchema>;

export const balancePointSchema = z.object({
  balance: moneySchema.describe('Balance amount'),
  currency: currencySchema.describe('Balance currency'),
  capturedAt: isoDateSchema.describe('Snapshot timestamp'),
});
export type BalancePoint = z.infer<typeof balancePointSchema>;

/** One UTC day of an account's spend; `amount` is null outside the period the data covers. */
export const accountSpendDaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('UTC day (YYYY-MM-DD)'),
  amount: moneySchema.describe('Spent that day').nullable(),
  estimated: z.boolean().describe('Includes an estimate for a top-up interval'),
});
export type AccountSpendDay = z.infer<typeof accountSpendDaySchema>;

/**
 * What an account spent over the last 30 complete UTC days (today excluded), in one currency.
 * Source: the provider's own charges when it reports them, else balance declines between snapshots
 * (a top-up interval is estimated from the account's average rate and marks the result approximate).
 */
export const accountSpendSchema = z.object({
  currency: currencySchema.describe('Currency of every amount').nullable(),
  source: z.enum(['charges', 'snapshots']).describe('Where the figures come from').nullable(),
  approximate: z.boolean().describe('Some days are estimated'),
  coveredDays: z.number().int().describe('Days of the window the data covers (0–30)'),
  days: z.array(accountSpendDaySchema).describe('Oldest first, 30 entries'),
  last7d: moneySchema.describe('Spent over the last 7 days').nullable(),
  last30d: moneySchema.describe('Spent over the covered part of the last 30 days').nullable(),
  perDay: moneySchema.describe('Average per covered day').nullable(),
});
export type AccountSpend = z.infer<typeof accountSpendSchema>;
