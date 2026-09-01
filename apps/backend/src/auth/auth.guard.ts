import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { Permission } from '@infra/shared';
import { AccountsRepository } from '@repositories/accounts/accounts.repository';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { IS_ANY_PRINCIPAL_KEY } from './any-principal.decorator';
import { memberPrincipalFromAccount, type Principal } from './principal';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRE_PERM_KEY } from './require-perm.decorator';
import { IS_SESSION_ONLY_KEY } from './session-only.decorator';

type AuthedRequest = Request & {
  cookies?: Record<string, string>;
  user?: string;
  authType?: 'session' | 'token';
  principal?: Principal;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly accounts: AccountsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    // 1) API token via `Authorization: Bearer <token>` — acts with admin rights.
    const bearer = this.bearerToken(req);
    if (bearer) {
      const name = await this.auth.verifyApiToken(bearer);
      if (name) {
        req.user = name;
        req.authType = 'token';
        req.principal = { kind: 'admin', username: name };
      }
    }
    // 2) Fall back to the session cookie (admin or member).
    if (!req.authType) {
      const session = await this.auth.verify(req.cookies?.[SESSION_COOKIE]);
      if (session) {
        req.principal = await this.resolveSessionPrincipal(session);
        req.user = req.principal.username;
        req.authType = 'session';
      }
    }
    if (!req.authType || !req.principal) throw new UnauthorizedException();

    // 3) Session-only routes (token management, auth/security) are off-limits to API tokens.
    const sessionOnly = this.reflector.getAllAndOverride<boolean>(IS_SESSION_ONLY_KEY, targets);
    if (sessionOnly && req.authType === 'token') {
      throw new ForbiddenException('Admin session required');
    }

    // 4) Deny-by-default for members: an endpoint is member-accessible only when it
    //    opted in via @AnyPrincipal or a @RequirePerm the member holds.
    if (req.principal.kind === 'member') {
      if (this.reflector.getAllAndOverride<boolean>(IS_ANY_PRINCIPAL_KEY, targets)) return true;
      const perm = this.reflector.getAllAndOverride<Permission>(REQUIRE_PERM_KEY, targets);
      if (!perm || !req.principal.permissions.has(perm)) throw new ForbiddenException();
    }
    return true;
  }

  /** Member accounts are re-read per request: disable/delete/permission edits apply instantly. */
  private async resolveSessionPrincipal(session: {
    username: string;
    accountUuid: string | null;
  }): Promise<Principal> {
    if (session.accountUuid == null) return { kind: 'admin', username: session.username };
    const account = await this.accounts.findByUuid(session.accountUuid);
    if (!account || account.disabled) throw new UnauthorizedException();
    return memberPrincipalFromAccount(account);
  }

  private bearerToken(req: AuthedRequest): string | undefined {
    const header = req.headers?.authorization;
    const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    return match?.[1]?.trim() || undefined;
  }
}
