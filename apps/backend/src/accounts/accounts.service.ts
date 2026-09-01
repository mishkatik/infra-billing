import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@generated/prisma/client';
import type {
  Account as AccountDto,
  ClaimInviteInput,
  CreatedInvite,
  CreateInviteInput,
  InviteInfo,
  Permission,
  ResetLink,
} from '@infra/shared';
import { AccountsRepository } from '@repositories/accounts/accounts.repository';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { hashToken } from '../api-tokens/token.util';
import { AuthConfigService } from '../auth/auth-config.service';
import { hashPassword } from '../auth/password.util';
import { normalizePermissions } from '../auth/principal';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

type AccountRow = Awaited<ReturnType<AccountsRepository['create']>>;
export type ClaimedAccountRow = Awaited<ReturnType<AccountsRepository['claimInvite']>>;

// One-time invite/reset links are valid for 7 days.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mapAccount(row: AccountRow): AccountDto {
  return {
    uuid: row.uuid,
    username: row.username,
    permissions: row.permissions as Permission[],
    projectUuids: row.projects.map((p) => p.projectUuid),
    disabled: row.disabled,
    pending: row.passwordHash == null,
    hasPasskeys: row._count.passkeys > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly authConfig: AuthConfigService,
    private readonly projects: ProjectsRepository,
  ) {}

  async list(): Promise<AccountDto[]> {
    const rows = await this.accounts.list();
    return rows.map(mapAccount);
  }

  async create(dto: CreateAccountDto): Promise<AccountDto> {
    await this.ensureUsernameFree(dto.username);
    await this.ensureProjects(dto.projectUuids);
    try {
      const row = await this.accounts.create({
        username: dto.username,
        passwordHash: hashPassword(dto.password),
        permissions: normalizePermissions(dto.permissions),
        webauthnUserId: Uint8Array.from(randomBytes(32)),
        projectUuids: dto.projectUuids,
      });
      return mapAccount(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username is taken');
      }
      throw e;
    }
  }

  async update(uuid: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const existing = await this.accounts.findByUuid(uuid);
    if (!existing) throw new NotFoundException('Account not found');
    if (dto.projectUuids !== undefined) {
      await this.ensureProjects(dto.projectUuids);
    }
    const row = await this.accounts.updateWithProjects(
      uuid,
      {
        // Setting a password directly must revoke any outstanding invite/reset link — otherwise
        // the old link would still work after the admin thought they'd already handled the account.
        ...(dto.password !== undefined
          ? {
              passwordHash: hashPassword(dto.password),
              setupTokenHash: null,
              setupTokenExpiresAt: null,
            }
          : {}),
        ...(dto.permissions !== undefined
          ? { permissions: normalizePermissions(dto.permissions) }
          : {}),
        ...(dto.disabled !== undefined ? { disabled: dto.disabled } : {}),
      },
      dto.projectUuids,
    );
    return mapAccount(row);
  }

  async remove(uuid: string): Promise<void> {
    if (!(await this.accounts.exists(uuid))) throw new NotFoundException('Account not found');
    await this.accounts.delete(uuid);
  }

  /** Admin creates a pending account: permissions + projects only, username/password left to the invitee. */
  async createInvite(dto: CreateInviteInput): Promise<CreatedInvite> {
    await this.ensureProjects(dto.projectUuids);
    const { token, hash, expiresAt } = this.mintToken();
    const row = await this.accounts.createInvite({
      permissions: normalizePermissions(dto.permissions),
      webauthnUserId: Uint8Array.from(randomBytes(32)),
      projectUuids: dto.projectUuids,
      setupTokenHash: hash,
      setupTokenExpiresAt: expiresAt,
    });
    return { uuid: row.uuid, token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Re-issue a link for any account (pending re-invite, or a reset on a claimed one). Clears
   * the current password so a reset takes effect immediately, even before the link is opened.
   */
  async issueInviteLink(uuid: string): Promise<ResetLink> {
    if (!(await this.accounts.exists(uuid))) throw new NotFoundException('Account not found');
    const { token, hash, expiresAt } = this.mintToken();
    await this.accounts.issueInviteLink(uuid, {
      setupTokenHash: hash,
      setupTokenExpiresAt: expiresAt,
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /** @Public — 404 (not the mode/username) for anything that isn't a currently-valid token. */
  async getInviteInfo(token: string): Promise<InviteInfo> {
    const account = await this.findValidInvite(hashToken(token));
    return { mode: account.username == null ? 'invite' : 'reset', username: account.username };
  }

  /**
   * @Public — validates like createAccount, sets username (invite only)/password and clears the
   * token in a single update, so a token can't be replayed after a failed or successful claim.
   */
  async claimInvite(token: string, dto: ClaimInviteInput): Promise<ClaimedAccountRow> {
    const hash = hashToken(token);
    const account = await this.findValidInvite(hash);
    const mode = account.username == null ? 'invite' : 'reset';
    if (mode === 'invite') {
      if (!dto.username) throw new BadRequestException('Username is required');
      await this.ensureUsernameFree(dto.username);
    } else if (dto.username) {
      throw new BadRequestException('Username cannot be changed by a reset link');
    }
    try {
      // Same hash findValidInvite just validated, re-checked by the update's WHERE clause: if the
      // token was rotated (or the account disabled) between that read and this write, the row
      // won't match and Prisma reports P2025 instead of silently claiming a stale link.
      return await this.accounts.claimInvite(account.uuid, hash, {
        ...(mode === 'invite' ? { username: dto.username } : {}),
        passwordHash: hashPassword(dto.password),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Invite link not found');
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username is taken');
      }
      throw e;
    }
  }

  /** Unknown and expired tokens answer identically — no oracle for whether a token ever existed. */
  private async findValidInvite(hash: string) {
    const account = await this.accounts.findBySetupTokenHash(hash);
    if (
      !account ||
      account.disabled ||
      !account.setupTokenExpiresAt ||
      account.setupTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('Invite link not found');
    }
    return account;
  }

  // Local raw token, deliberately not api-tokens' generateToken — that one carries the 'ib_'
  // prefix reserved for long-lived API tokens, and an invite/reset link isn't one.
  private mintToken(): { token: string; hash: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
  }

  private async ensureUsernameFree(username: string): Promise<void> {
    const admin = await this.authConfig.getRow();
    if (admin && admin.username === username) {
      throw new ConflictException('Username is taken');
    }
    if (await this.accounts.findByUsername(username)) {
      throw new ConflictException('Username is taken');
    }
  }

  private async ensureProjects(projectUuids: string[]): Promise<void> {
    for (const uuid of projectUuids) {
      if (!(await this.projects.exists(uuid))) throw new NotFoundException('Project not found');
    }
  }
}
