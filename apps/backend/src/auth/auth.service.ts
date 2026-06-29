import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import { verifyPassword } from './password.util';
import { hashToken } from '../api-tokens/token.util';

export const SESSION_COOKIE = 'infra_session';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

interface SessionPayload {
  u: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly authConfig: AuthConfigService,
    private readonly prisma: PrismaService,
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

  /** Validate an API token (Authorization: Bearer), returning its name or null. */
  async verifyApiToken(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    // Only the hash is stored; look the presented token up by its SHA-256.
    const row = await this.prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row) return null;
    // Throttle the lastUsedAt write to ~once/min so we don't write on every request.
    const now = Date.now();
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000) {
      await this.prisma.apiToken
        .update({ where: { uuid: row.uuid }, data: { lastUsedAt: new Date(now) } })
        .catch(() => undefined);
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
