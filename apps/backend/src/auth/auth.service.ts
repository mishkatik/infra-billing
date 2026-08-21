import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { AppConfigService } from '@config/app-config.service';
import { ApiTokensRepository } from '@repositories/api-tokens/api-tokens.repository';
import { AccountsRepository } from '@repositories/accounts/accounts.repository';
import { AuthConfigService } from './auth-config.service';
import { burnKdf, verifyPassword } from './password.util';
import { hashToken } from '../api-tokens/token.util';

export const SESSION_COOKIE = 'infra_session';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

interface SessionPayload {
  u: string;
  acc?: string;
}

export interface SessionIdentity {
  username: string;
  accountUuid: string | null;
}

export type AccountWithProjects = NonNullable<
  Awaited<ReturnType<AccountsRepository['findByUsername']>>
>;

export interface LoginResult {
  username: string;
  account: AccountWithProjects | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly authConfig: AuthConfigService,
    private readonly apiTokens: ApiTokensRepository,
    private readonly accounts: AccountsRepository,
  ) {}

  /** Sign a session JWT; member sessions carry the account uuid. */
  async sign(username: string, accountUuid?: string): Promise<string> {
    const secret = await this.authConfig.getSessionSecret();
    const payload: SessionPayload = accountUuid
      ? { u: username, acc: accountUuid }
      : { u: username };
    return jwt.sign(payload, secret, { expiresIn: SESSION_MAX_AGE_SEC });
  }

  /** Validate a session token, returning the identity or null. */
  async verify(token: string | undefined): Promise<SessionIdentity | null> {
    if (!token) return null;
    try {
      const secret = await this.authConfig.getSessionSecret();
      const decoded = jwt.verify(token, secret) as SessionPayload;
      if (typeof decoded?.u !== 'string') return null;
      // A present-but-non-string `acc` is malformed, not "no account" — reject rather than
      // silently treating the session as admin.
      if (decoded.acc !== undefined && typeof decoded.acc !== 'string') return null;
      return {
        username: decoded.u,
        accountUuid: decoded.acc ?? null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Constant-time password check against the admin row, then member accounts.
   * The KDF runs exactly once on every path (real or dummy hash), so response time
   * reveals neither whether the username exists nor which table matched.
   */
  async verifyLogin(username: string, password: string): Promise<LoginResult | null> {
    const row = await this.authConfig.getRow();
    if (row?.passwordEnabled && this.safeEqual(username, row.username)) {
      let ok: boolean;
      if (row.passwordHash) {
        ok = verifyPassword(password, row.passwordHash);
      } else {
        burnKdf(password);
        ok = false;
      }
      return ok ? { username: row.username, account: null } : null;
    }
    // passwordEnabled is owner-scoped: members always keep password login (no lockout risk).
    const account = await this.accounts.findByUsername(username);
    if (account && !account.disabled) {
      let ok: boolean;
      if (account.passwordHash) {
        ok = verifyPassword(password, account.passwordHash);
      } else {
        burnKdf(password);
        ok = false;
      }
      // `username` (the lookup key) equals `account.username` here, and is non-null — unlike
      // the row's own field, which stays nullable for still-pending accounts.
      return ok ? { username, account } : null;
    }
    burnKdf(password);
    return null;
  }

  /** Validate an API token (Authorization: Bearer), returning its name or null. */
  async verifyApiToken(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    // Only the hash is stored; look the presented token up by its SHA-256.
    const row = await this.apiTokens.findByHash(hashToken(token));
    if (!row) return null;
    // Throttle the lastUsedAt write to ~once/min so we don't write on every request.
    const now = Date.now();
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000) {
      await this.apiTokens.touchLastUsed(row.uuid, new Date(now));
    }
    return row.tokenName;
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.isProd,
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC * 1000,
    };
  }

  private safeEqual(a: string, b: string): boolean {
    // Hash both inputs to a fixed length first, so neither the value nor the length leaks via timing.
    const ha = createHash('sha256').update(String(a)).digest();
    const hb = createHash('sha256').update(String(b)).digest();
    return timingSafeEqual(ha, hb);
  }
}
