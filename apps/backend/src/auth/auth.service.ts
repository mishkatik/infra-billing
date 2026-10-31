import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { API, API_PREFIX, ApiTokenScope } from '@infra/shared';
import { AppConfigService } from '@config/app-config.service';
import { ApiTokensRepository } from '@repositories/api-tokens/api-tokens.repository';
import { AuthConfigService } from './auth-config.service';
import { verifyPassword } from './password.util';
import { hashToken } from '../api-tokens/token.util';
import { TELEGRAM_FLOW_TTL_MS } from './telegram-oidc.service';

export const SESSION_COOKIE = 'infra_session';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

// Encrypted state of a Telegram sign-in/link round-trip. Scoped to the Telegram routes and Lax:
// the callback is a cross-site redirect from oauth.telegram.org, which a Strict cookie never sees.
export const TELEGRAM_FLOW_COOKIE = 'infra_tg_flow';
const TELEGRAM_FLOW_PATH = `/${API_PREFIX}/${API.AUTH}/telegram`;
// Outlives the flow's own expiry a little, so a late callback still carries the (expired) flow
// and a slow link attempt is sent back to the settings page instead of the login page.
const TELEGRAM_FLOW_MAX_AGE_MS = TELEGRAM_FLOW_TTL_MS + 5 * 60 * 1000;

interface SessionPayload {
  u: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly authConfig: AuthConfigService,
    private readonly apiTokens: ApiTokensRepository,
  ) {}

  /** Constant-time credential check against the admin row in the DB. */
  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const row = await this.authConfig.getRow();
    if (!row?.passwordEnabled) return false;
    // Run the KDF unconditionally so response time doesn't reveal whether the username matched
    // (no username-enumeration timing oracle); compare the username constant-time too.
    const passwordOk = verifyPassword(password, row.passwordHash);
    const usernameOk = this.safeEqual(username, row.username);
    return usernameOk && passwordOk;
  }

  /** Sign a session JWT for the given username (7d expiry). */
  async sign(username: string): Promise<string> {
    const secret = await this.authConfig.getSessionSecret();
    return jwt.sign({ u: username } satisfies SessionPayload, secret, {
      expiresIn: SESSION_MAX_AGE_SEC,
    });
  }

  /** Validate a session token, returning the username or null. */
  async verify(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
      const secret = await this.authConfig.getSessionSecret();
      const decoded = jwt.verify(token, secret) as SessionPayload;
      return typeof decoded?.u === 'string' ? decoded.u : null;
    } catch {
      return null;
    }
  }

  /** Validate an API token (Authorization: Bearer), returning its name and scope or null. */
  async verifyApiToken(
    token: string | undefined,
  ): Promise<{ name: string; scope: ApiTokenScope } | null> {
    if (!token) return null;
    // Only the hash is stored; look the presented token up by its SHA-256.
    const row = await this.apiTokens.findByHash(hashToken(token));
    if (!row) return null;
    // Throttle the lastUsedAt write to ~once/min so we don't write on every request.
    const now = Date.now();
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000) {
      await this.apiTokens.touchLastUsed(row.uuid, new Date(now));
    }
    return { name: row.tokenName, scope: row.scope as ApiTokenScope };
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.cookieSecure,
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC * 1000,
    };
  }

  flowCookieOptions(): CookieOptions {
    return { ...this.flowCookieClearOptions(), maxAge: TELEGRAM_FLOW_MAX_AGE_MS };
  }

  /** Same attributes minus maxAge: clearCookie only matches a cookie with the same path. */
  flowCookieClearOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: TELEGRAM_FLOW_PATH,
    };
  }

  private safeEqual(a: string, b: string): boolean {
    // Hash both inputs to a fixed length first, so neither the value nor the length leaks via timing.
    const ha = createHash('sha256').update(String(a)).digest();
    const hb = createHash('sha256').update(String(b)).digest();
    return timingSafeEqual(ha, hb);
  }
}
