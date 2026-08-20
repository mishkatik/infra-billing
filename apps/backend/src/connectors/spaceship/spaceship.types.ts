export interface SpaceshipCredentials {
  apiKey: string;
  apiSecret: string;
}

/** Error body Spaceship returns on 4xx/5xx. */
export interface SpaceshipError {
  detail?: string;
}

export interface SpaceshipDomain {
  name: string; // ASCII (punycode) form
  unicodeName?: string;
  isPremium?: boolean;
  autoRenew?: boolean;
  registrationDate?: string; // ISO-8601
  expirationDate?: string; // ISO-8601
  lifecycleStatus?: string; // e.g. "registered"
  [key: string]: unknown;
}

export interface SpaceshipDomainsResponse {
  items?: SpaceshipDomain[];
  total?: number;
}
