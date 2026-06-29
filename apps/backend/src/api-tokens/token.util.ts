import { createHash, randomBytes } from 'node:crypto';

/** A fresh API token: 256-bit URL-safe random with an `ib_` prefix (infra-billing). */
export function generateToken(): string {
  return `ib_${randomBytes(32).toString('base64url')}`;
}

/**
 * SHA-256 (hex) of a token. The token is 256-bit random, so an unsalted hash is infeasible to
 * brute-force; this is what we store and what verification compares against. Matches Postgres
 * `encode(sha256(token::bytea),'hex')`, so existing tokens migrate in place.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Masked display form kept in the DB: `ib_` + first 8 chars of the random body. */
export function tokenPrefix(token: string): string {
  return token.slice(0, 11);
}
