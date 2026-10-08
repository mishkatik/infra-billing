import {
  ApiToken,
  Payment,
  Prisma,
  Project,
  Provider,
  ProviderAccount,
  Service,
  SyncRun,
} from '@generated/prisma/client';
import {
  ApiToken as ApiTokenDto,
  MoneyAmount,
  Payment as PaymentDto,
  PaymentType,
  Period,
  Project as ProjectDto,
  ProviderAccount as ProviderAccountDto,
  Provider as ProviderDto,
  ProviderKind,
  Service as ServiceDto,
  ServiceType,
  SyncRun as SyncRunDto,
} from '@infra/shared';
import { dateToIso, decimalToString } from './serialize';

type AccountRow = ProviderAccount & { _count?: { services: number; payments: number } };

/** Non-secret credential hints and has* flags, computed by the caller (they need decryption). */
type CredentialHints = Partial<ProviderAccountDto>;

/**
 * Prisma ProviderAccount → API DTO. credentialsEnc is NEVER included; only whatever `hints` the
 * caller derived from it.
 */
export function mapProviderAccount(a: AccountRow, hints: CredentialHints = {}): ProviderAccountDto {
  return {
    uuid: a.uuid,
    providerUuid: a.providerUuid,
    label: a.label,
    isEnabled: a.isEnabled,
    isPostpaid: a.isPostpaid,
    balance: decimalToString(a.balance),
    balanceCurrency: a.balanceCurrency,
    balanceSyncedAt: dateToIso(a.balanceSyncedAt),
    lastSyncAt: dateToIso(a.lastSyncAt),
    lastSyncError: a.lastSyncError,
    servicesCount: a._count?.services ?? 0,
    paymentsCount: a._count?.payments ?? 0,
    ...hints,
    createdAt: dateToIso(a.createdAt)!,
    updatedAt: dateToIso(a.updatedAt)!,
  };
}

/** Account balances summed per currency, in the order the currencies first appear. */
function sumBalances(accounts: AccountRow[]): MoneyAmount[] {
  const sums = new Map<string, Prisma.Decimal>();
  for (const a of accounts) {
    if (a.balance === null || a.balanceCurrency === null) continue;
    const prev = sums.get(a.balanceCurrency);
    sums.set(a.balanceCurrency, prev ? prev.plus(a.balance) : a.balance);
  }
  return [...sums].map(([currency, amount]) => ({ amount: amount.toFixed(2), currency }));
}

/** Prisma Provider with its accounts → API DTO; counts and balances are summed over accounts. */
export function mapProvider(
  p: Provider & { accounts: AccountRow[] },
  hintsFor: (a: AccountRow) => CredentialHints = () => ({}),
): ProviderDto {
  const accounts = p.accounts.map((a) => mapProviderAccount(a, hintsFor(a)));
  return {
    uuid: p.uuid,
    name: p.name,
    kind: p.kind as ProviderKind,
    faviconLink: p.faviconLink,
    loginUrl: p.loginUrl,
    iconName: p.iconName,
    iconBg: p.iconBg,
    accounts,
    balances: sumBalances(p.accounts),
    servicesCount: accounts.reduce((n, a) => n + a.servicesCount, 0),
    paymentsCount: accounts.reduce((n, a) => n + a.paymentsCount, 0),
    createdAt: dateToIso(p.createdAt)!,
    updatedAt: dateToIso(p.updatedAt)!,
  };
}

export function mapProject(p: Project & { _count?: { services: number } }): ProjectDto {
  return {
    uuid: p.uuid,
    name: p.name,
    faviconLink: p.faviconLink,
    iconName: p.iconName,
    iconBg: p.iconBg,
    servicesCount: p._count?.services,
    createdAt: dateToIso(p.createdAt)!,
    updatedAt: dateToIso(p.updatedAt)!,
  };
}

export function mapService(s: Service & { _count?: { payments: number } }): ServiceDto {
  return {
    uuid: s.uuid,
    providerUuid: s.providerUuid,
    accountUuid: s.accountUuid,
    projectUuid: s.projectUuid,
    name: s.name,
    description: s.description,
    type: s.type as ServiceType,
    externalId: s.externalId,
    countryCode: s.countryCode,
    cost: decimalToString(s.cost)!,
    currency: s.currency,
    period: s.period as Period,
    nextBillingAt: dateToIso(s.nextBillingAt),
    isActive: s.isActive,
    isManaged: s.isManaged,
    costOverridden: s.costOverridden,
    nameOverridden: s.nameOverridden,
    typeOverridden: s.typeOverridden,
    meta: (s.meta ?? {}) as Record<string, unknown>,
    paymentsCount: s._count?.payments,
    createdAt: dateToIso(s.createdAt)!,
    updatedAt: dateToIso(s.updatedAt)!,
  };
}

export function mapSyncRun(r: SyncRun): SyncRunDto {
  return {
    id: r.id.toString(),
    accountUuid: r.accountUuid,
    status: r.status as SyncRunDto['status'],
    servicesFound: r.servicesFound,
    error: r.error,
    startedAt: dateToIso(r.startedAt)!,
    finishedAt: dateToIso(r.finishedAt),
  };
}

export function mapApiToken(t: ApiToken): ApiTokenDto {
  return {
    uuid: t.uuid,
    tokenName: t.tokenName,
    // Only the masked prefix is exposed. The raw token is never stored or returned after creation.
    tokenPrefix: t.tokenPrefix,
    lastUsedAt: dateToIso(t.lastUsedAt),
    createdAt: dateToIso(t.createdAt)!,
  };
}

export function mapPayment(p: Payment): PaymentDto {
  return {
    uuid: p.uuid,
    providerUuid: p.providerUuid,
    accountUuid: p.accountUuid,
    serviceUuid: p.serviceUuid,
    amount: decimalToString(p.amount)!,
    currency: p.currency,
    description: p.description,
    paymentDate: dateToIso(p.paymentDate)!,
    type: p.type as PaymentType,
    externalId: p.externalId,
    createdAt: dateToIso(p.createdAt)!,
    updatedAt: dateToIso(p.updatedAt)!,
  };
}
