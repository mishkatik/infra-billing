import { ApiToken, Payment, Project, Provider, Service, SyncRun } from '@generated/prisma/client';
import {
  ApiToken as ApiTokenDto,
  Payment as PaymentDto,
  PaymentType,
  Period,
  Project as ProjectDto,
  Provider as ProviderDto,
  ProviderKind,
  Service as ServiceDto,
  ServiceType,
  SyncRun as SyncRunDto,
} from '@infra/shared';
import { dateToIso, decimalToString } from './serialize';

/** Prisma Provider → API DTO. The API token (credentialsEnc) is NEVER included. */
export function mapProvider(
  p: Provider & { _count?: { services: number; payments?: number } },
): ProviderDto {
  return {
    uuid: p.uuid,
    name: p.name,
    kind: p.kind as ProviderKind,
    faviconLink: p.faviconLink,
    loginUrl: p.loginUrl,
    balance: decimalToString(p.balance),
    balanceCurrency: p.balanceCurrency,
    isPostpaid: p.isPostpaid,
    balanceSyncedAt: dateToIso(p.balanceSyncedAt),
    lastSyncAt: dateToIso(p.lastSyncAt),
    lastSyncError: p.lastSyncError,
    servicesCount: p._count?.services,
    paymentsCount: p._count?.payments,
    createdAt: dateToIso(p.createdAt)!,
    updatedAt: dateToIso(p.updatedAt)!,
  };
}

export function mapProject(p: Project & { _count?: { services: number } }): ProjectDto {
  return {
    uuid: p.uuid,
    name: p.name,
    faviconLink: p.faviconLink,
    servicesCount: p._count?.services,
    createdAt: dateToIso(p.createdAt)!,
    updatedAt: dateToIso(p.updatedAt)!,
  };
}

export function mapService(s: Service & { _count?: { payments: number } }): ServiceDto {
  return {
    uuid: s.uuid,
    providerUuid: s.providerUuid,
    projectUuid: s.projectUuid,
    name: s.name,
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
    meta: (s.meta ?? {}) as Record<string, unknown>,
    paymentsCount: s._count?.payments,
    createdAt: dateToIso(s.createdAt)!,
    updatedAt: dateToIso(s.updatedAt)!,
  };
}

export function mapSyncRun(r: SyncRun): SyncRunDto {
  return {
    id: r.id.toString(),
    providerUuid: r.providerUuid,
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
    // Only the masked prefix is exposed — the raw token is never stored or returned after creation.
    tokenPrefix: t.tokenPrefix,
    lastUsedAt: dateToIso(t.lastUsedAt),
    createdAt: dateToIso(t.createdAt)!,
  };
}

export function mapPayment(p: Payment): PaymentDto {
  return {
    uuid: p.uuid,
    providerUuid: p.providerUuid,
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
