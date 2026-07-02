// StormWall API v3 response shapes (https://api.stormwall.pro/v3/api/swagger.json, fetched and
// verified directly — 131 endpoints, zero price/cost/amount/currency/invoice/payment/tariff/
// subscription fields anywhere in the spec). Only consumed fields are typed.

export interface StormwallEnvelope<T> {
  status: string; // "ok" on success
  payload: T;
}

export interface StormwallPaged<T> {
  total: number;
  limit: number;
  offset: number;
  results: T[];
}

// GET /v3/services item (ServiceWithoutObjectDto). Every field is required in the schema.
export interface StormwallService {
  serviceId: number;
  type: 'service' | 'network' | 'domain' | 'ha_proxy' | 'whmcs_service';
  clientName: string;
  createdAt: string;
  partnerId: number;
  customerId: number;
  billingDay: string; // date, e.g. "2025-01-01"
  productId: number;
  productName: string;
  productGroupId: number;
  productGroupName: string;
  useStormwallDns: boolean;
  useSsl: boolean;
  disableFw: boolean;
  protectedIps: string[];
  ipSetName: string | null;
}

// GET /v3/domains?serviceId= item (GetDomainsResponseDto). Used only for name enrichment.
export interface StormwallDomain {
  id: number;
  domain: string;
  protection: Record<string, unknown>;
  product: { id: number; name: string; groupId: number; groupName: string };
  useStormwallDns: number;
  withDecryptionSecurity: boolean;
  isEnterprise: boolean;
  enabled: boolean;
  serviceId: number;
  protectedIps: string[];
}
