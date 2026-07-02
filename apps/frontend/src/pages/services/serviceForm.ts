export interface SForm {
  providerUuid: string;
  projectUuid: string;
  name: string;
  type: string;
  cost: string;
  currency: string;
  period: string;
  countryCode: string;
  nextBillingAt: string;
}

export const toIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);
