import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { Provider as ProviderDto, Service as ServiceDto } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { mapProvider, mapService } from '@common/mappers';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

const COUNT_INCLUDE = { _count: { select: { services: true, payments: true } } } as const;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async list(): Promise<ProviderDto[]> {
    const rows = await this.prisma.provider.findMany({
      orderBy: { createdAt: 'asc' },
      include: COUNT_INCLUDE,
    });
    return rows.map((r) => this.withCredentialHints(mapProvider(r), r.kind, r.credentialsEnc));
  }

  async getWithServices(uuid: string): Promise<ProviderDto & { services: ServiceDto[] }> {
    const p = await this.prisma.provider.findUnique({
      where: { uuid },
      include: { ...COUNT_INCLUDE, services: { orderBy: { createdAt: 'asc' } } },
    });
    if (!p) throw new NotFoundException('Provider not found');
    const dto = this.withCredentialHints(mapProvider(p), p.kind, p.credentialsEnc);
    return { ...dto, services: p.services.map(mapService) };
  }

  /** Expose non-secret credential fields (baseUrl/username/accountId) for the edit form. */
  private withCredentialHints(dto: ProviderDto, kind: string, enc: Uint8Array | null): ProviderDto {
    if (kind === 'selectel') {
      const c = this.decodeCredentials(enc);
      // Never expose the password.
      return {
        ...dto,
        accountId: c.accountId ?? null,
        username: c.username ?? null,
        projectName: c.projectName ?? null,
      };
    }
    if (kind === '4vps') {
      // Never expose the token; panelId is a non-secret hint.
      const c = this.decodeCredentials(enc);
      return { ...dto, panelId: c.panelId ?? null };
    }
    if (kind !== 'hostbill' && kind !== 'billmgr') return dto;
    const c = this.decodeCredentials(enc);
    // Never expose password/totpSecret.
    return { ...dto, baseUrl: c.baseUrl ?? null, username: c.username ?? null };
  }

  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const p = await this.prisma.provider.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        loginUrl: dto.loginUrl ?? null,
        credentialsEnc: this.buildCredentials(dto.kind, dto),
      },
      include: COUNT_INCLUDE,
    });
    return this.withCredentialHints(mapProvider(p), p.kind, p.credentialsEnc);
  }

  async update(uuid: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    const existing = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { kind: true, credentialsEnc: true },
    });
    if (!existing) throw new NotFoundException('Provider not found');
    const data: Prisma.ProviderUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.loginUrl !== undefined) data.loginUrl = dto.loginUrl;
    // Merge onto existing credentials so a partial edit works — e.g. adding only a TOTP
    // secret to an existing BILLmanager provider without re-entering the password.
    const creds = this.buildCredentials(existing.kind, dto, existing.credentialsEnc);
    if (creds !== null) data.credentialsEnc = creds;
    const p = await this.prisma.provider.update({ where: { uuid }, data, include: COUNT_INCLUDE });
    return this.withCredentialHints(mapProvider(p), p.kind, p.credentialsEnc);
  }

  async remove(uuid: string): Promise<void> {
    await this.ensureExists(uuid);
    await this.prisma.provider.delete({ where: { uuid } });
  }

  /**
   * Encrypt provider credentials for storage. timeweb/hetzner → the raw token.
   * hostbill/billmgr/selectel/4vps → JSON (per-kind fields). New values are merged onto
   * `existingEnc` so a partial update (e.g. adding only a TOTP secret) keeps the rest. Returns
   * null when nothing credential-related was supplied (update leaves creds intact).
   */
  private buildCredentials(
    kind: string,
    dto: {
      token?: string;
      baseUrl?: string;
      username?: string;
      password?: string;
      totpSecret?: string;
      accountId?: string;
      projectName?: string;
      panelId?: string;
    },
    existingEnc?: Uint8Array | null,
  ): Uint8Array<ArrayBuffer> | null {
    if (kind === '4vps') {
      // JSON { token, panelId? }; merge so a panel-id-only edit keeps the token.
      if (!dto.token && !dto.panelId) return null;
      const base = this.decodeCredentials(existingEnc);
      const token = dto.token ?? base.token;
      if (!token) throw new BadRequestException('Provide the 4VPS API token');
      const creds: Record<string, string> = { token };
      const panelId = dto.panelId ?? base.panelId;
      if (panelId) creds.panelId = panelId;
      return this.crypto.encrypt(JSON.stringify(creds));
    }
    if (kind === 'selectel') {
      // Keystone service user: JSON { accountId, username, password, projectName? }; merge edits.
      const supplied = dto.accountId || dto.username || dto.password || dto.projectName;
      if (!supplied) return null;
      const base = this.decodeCredentials(existingEnc);
      const accountId = dto.accountId ?? base.accountId;
      const username = dto.username ?? base.username;
      const password = dto.password ?? base.password;
      if (!accountId || !username || !password) {
        throw new BadRequestException('Provide the account number, username and password together');
      }
      const creds: Record<string, string> = { accountId, username, password };
      const projectName = dto.projectName ?? base.projectName;
      if (projectName) creds.projectName = projectName;
      return this.crypto.encrypt(JSON.stringify(creds));
    }
    if (kind === 'hostbill' || kind === 'billmgr') {
      const supportsTotp = kind === 'billmgr';
      const supplied =
        dto.baseUrl || dto.username || dto.password || (supportsTotp && dto.totpSecret);
      if (!supplied) return null;

      const base = this.decodeCredentials(existingEnc);
      const baseUrl = dto.baseUrl ?? base.baseUrl;
      const username = dto.username ?? base.username;
      const password = dto.password ?? base.password;
      if (!baseUrl || !username || !password) {
        throw new BadRequestException('Provide baseUrl, username and password together');
      }
      const creds: Record<string, string> = { baseUrl, username, password };
      const totpSecret = supportsTotp ? (dto.totpSecret ?? base.totpSecret) : undefined;
      if (totpSecret) creds.totpSecret = totpSecret;
      return this.crypto.encrypt(JSON.stringify(creds));
    }
    if (kind !== 'manual' && dto.token) return this.crypto.encrypt(dto.token);
    return null;
  }

  /** Decrypt the stored JSON credentials (hostbill/billmgr), or {} if none/unparseable. */
  private decodeCredentials(enc?: Uint8Array | null): Record<string, string> {
    if (!enc) return {};
    try {
      return JSON.parse(this.crypto.decrypt(enc)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async ensureExists(uuid: string): Promise<void> {
    const found = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    if (!found) throw new NotFoundException('Provider not found');
  }
}
