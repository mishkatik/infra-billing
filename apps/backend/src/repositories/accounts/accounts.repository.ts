import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.account.findMany({
      orderBy: { createdAt: 'asc' },
      include: { projects: true, _count: { select: { passkeys: true } } },
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.account.findUnique({ where: { uuid }, include: { projects: true } });
  }

  findByUsername(username: string) {
    return this.prisma.account.findUnique({ where: { username }, include: { projects: true } });
  }

  /** Looked up by the SHA-256 of a presented invite/reset token; expiry is checked by the caller. */
  findBySetupTokenHash(hash: string) {
    return this.prisma.account.findUnique({
      where: { setupTokenHash: hash },
      include: { projects: true },
    });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.account.findUnique({ where: { uuid }, select: { uuid: true } });
    return found !== null;
  }

  // Pending accounts (no password set yet) can't complete password login, so they don't count
  // toward "is there a member password-login path" for the login page's method disclosure.
  countEnabled(): Promise<number> {
    return this.prisma.account.count({ where: { disabled: false, passwordHash: { not: null } } });
  }

  create(data: {
    username: string;
    passwordHash: string;
    permissions: string[];
    webauthnUserId: Uint8Array<ArrayBuffer>;
    projectUuids: string[];
  }) {
    return this.prisma.account.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        permissions: data.permissions,
        webauthnUserId: data.webauthnUserId,
        projects: { create: data.projectUuids.map((projectUuid) => ({ projectUuid })) },
      },
      include: { projects: true, _count: { select: { passkeys: true } } },
    });
  }

  /** Pending row: username/passwordHash stay null, only a claim can set them. */
  createInvite(data: {
    permissions: string[];
    webauthnUserId: Uint8Array<ArrayBuffer>;
    projectUuids: string[];
    setupTokenHash: string;
    setupTokenExpiresAt: Date;
  }) {
    return this.prisma.account.create({
      data: {
        permissions: data.permissions,
        webauthnUserId: data.webauthnUserId,
        setupTokenHash: data.setupTokenHash,
        setupTokenExpiresAt: data.setupTokenExpiresAt,
        projects: { create: data.projectUuids.map((projectUuid) => ({ projectUuid })) },
      },
      include: { projects: true, _count: { select: { passkeys: true } } },
    });
  }

  /** Issue a fresh invite/reset link on any account, clearing its password (old one stops working). */
  issueInviteLink(uuid: string, data: { setupTokenHash: string; setupTokenExpiresAt: Date }) {
    return this.prisma.account.update({
      where: { uuid },
      data: { ...data, passwordHash: null },
      include: { projects: true, _count: { select: { passkeys: true } } },
    });
  }

  /**
   * Atomically sets the password (and, on invite, the username) and clears the used token —
   * conditional on `setupTokenHash` still matching what the caller validated, so a token rotated
   * (or the account disabled) between the read and this write makes the update match no row
   * instead of claiming a stale link. Throws Prisma P2025 in that case; the caller maps it to 404.
   */
  claimInvite(
    uuid: string,
    setupTokenHash: string,
    data: { username?: string; passwordHash: string },
  ) {
    return this.prisma.account.update({
      where: { uuid, setupTokenHash, disabled: false },
      data: {
        ...(data.username !== undefined ? { username: data.username } : {}),
        passwordHash: data.passwordHash,
        setupTokenHash: null,
        setupTokenExpiresAt: null,
      },
      include: { projects: true },
    });
  }

  /** Patch fields and (optionally) replace the project allowlist in one transaction. */
  updateWithProjects(uuid: string, data: Prisma.AccountUpdateInput, projectUuids?: string[]) {
    return this.prisma.$transaction(async (tx) => {
      if (projectUuids !== undefined) {
        await tx.accountProject.deleteMany({ where: { accountUuid: uuid } });
        await tx.accountProject.createMany({
          data: projectUuids.map((projectUuid) => ({ accountUuid: uuid, projectUuid })),
        });
      }
      return tx.account.update({
        where: { uuid },
        data,
        include: { projects: true, _count: { select: { passkeys: true } } },
      });
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.account.delete({ where: { uuid } });
  }
}
