import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PasskeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByOwner(accountUuid: string | null) {
    return this.prisma.passkey.findMany({ where: { accountUuid }, orderBy: { createdAt: 'asc' } });
  }

  async listNamesByOwner(accountUuid: string | null): Promise<(string | null)[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { accountUuid },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  countByOwner(accountUuid: string | null) {
    return this.prisma.passkey.count({ where: { accountUuid } });
  }

  countMembers() {
    return this.prisma.passkey.count({ where: { accountUuid: { not: null } } });
  }

  findByUuid(uuid: string) {
    return this.prisma.passkey.findUnique({ where: { uuid } });
  }

  findByCredentialId(credentialId: string) {
    return this.prisma.passkey.findUnique({ where: { credentialId } });
  }

  create(data: Prisma.PasskeyCreateInput) {
    return this.prisma.passkey.create({ data });
  }

  /** Persist the authenticator counter after a successful login. */
  async recordLogin(uuid: string, counter: bigint): Promise<void> {
    await this.prisma.passkey.update({
      where: { uuid },
      data: { counter, lastUsedAt: new Date() },
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.passkey.delete({ where: { uuid } });
  }
}
