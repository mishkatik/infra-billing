import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import {
  Provider as ProviderDto,
  Service as ServiceDto,
  YandexDiscoverResult,
} from '@infra/shared';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { VDSINA_BASE_URLS } from '@connectors/vdsina/vdsina.types';
import { YandexConnector } from '../connectors/yandex/yandex.connector';
import type { YandexCredentials } from '../connectors/yandex/yandex.types';
import { CryptoService } from '../crypto/crypto.service';
import { mapProvider, mapService } from '@common/mappers';
import { CreateProviderDto, UpdateProviderDto, YandexDiscoverDto } from './dto/provider.dto';

// Cap the discovery call so a hanging Yandex API request can't wedge the request handler.
const DISCOVER_TIMEOUT_MS = 20_000;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly providers: ProvidersRepository,
    private readonly crypto: CryptoService,
  ) {}

  async list(): Promise<ProviderDto[]> {
    const rows = await this.providers.listWithCounts();
    return rows.map((r) => this.withCredentialHints(mapProvider(r), r.kind, r.credentialsEnc));
  }

  async getWithServices(uuid: string): Promise<ProviderDto & { services: ServiceDto[] }> {
    const p = await this.providers.findWithServices(uuid);
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
    if (kind === 'vdsina') {
      // Never expose the token; the branch base URL is a non-secret hint.
      const c = this.decodeCredentials(enc);
      return { ...dto, baseUrl: c.baseUrl ?? null };
    }
    if (kind === 'beget') {
      // Only the login is a non-secret hint; never expose password/totpSecret/apiPassword.
      const c = this.decodeCredentials(enc);
      return { ...dto, username: c.username ?? null };
    }
    if (kind === 'cloudflare') {
      // accountId is a non-secret hint; never expose the apiToken.
      const c = this.decodeCredentials(enc);
      return { ...dto, accountId: c.accountId ?? null };
    }
    if (kind !== 'hostbill' && kind !== 'billmgr') return dto;
    const c = this.decodeCredentials(enc);
    // Never expose password/totpSecret.
    return { ...dto, baseUrl: c.baseUrl ?? null, username: c.username ?? null };
  }

  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const p = await this.providers.create({
      name: dto.name,
      kind: dto.kind,
      loginUrl: dto.loginUrl ?? null,
      isPostpaid: dto.isPostpaid ?? false,
      credentialsEnc: this.buildCredentials(dto.kind, dto),
    });
    return this.withCredentialHints(mapProvider(p), p.kind, p.credentialsEnc);
  }

  async update(uuid: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    const existing = await this.providers.findCredentials(uuid);
    if (!existing) throw new NotFoundException('Provider not found');
    const data: Prisma.ProviderUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.loginUrl !== undefined) data.loginUrl = dto.loginUrl;
    if (dto.isPostpaid !== undefined) data.isPostpaid = dto.isPostpaid;
    // Merge onto existing credentials so a partial edit works, e.g. adding only a TOTP
    // secret to an existing BILLmanager provider without re-entering the password.
    const creds = this.buildCredentials(existing.kind, dto, existing.credentialsEnc);
    if (creds !== null) data.credentialsEnc = creds;
    const p = await this.providers.update(uuid, data);
    return this.withCredentialHints(mapProvider(p), p.kind, p.credentialsEnc);
  }

  async remove(uuid: string): Promise<void> {
    await this.ensureExists(uuid);
    await this.providers.delete(uuid);
  }

  // Encrypt creds for storage: timeweb/hetzner → raw token; hostbill/billmgr/selectel/4vps → JSON.
  // Merged onto existingEnc so a partial edit (e.g. only a TOTP secret) keeps the rest. Returns null
  // when nothing credential-related was supplied (update leaves creds intact).
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
      apiPassword?: string;
      secretKey?: string;
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
    if (kind === 'vdsina') {
      // JSON { token, baseUrl? }; merge so a base-url-only edit keeps the token. Two official
      // branches share one API; the base URL picks the branch and its billing currency
      // (.ru — RUB, .com — USD). Anything else would leak the token to a foreign host.
      if (!dto.token && !dto.baseUrl) return null;
      const base = this.decodeCredentials(existingEnc);
      const token = dto.token ?? base.token;
      if (!token) throw new BadRequestException('Provide the VDSina API token');
      const creds: Record<string, string> = { token };
      const baseUrl = (dto.baseUrl ?? base.baseUrl)?.replace(/\/+$/, '');
      if (baseUrl && !VDSINA_BASE_URLS[baseUrl]) {
        throw new BadRequestException(
          'VDSina base URL must be https://userapi.vdsina.ru or https://userapi.vdsina.com',
        );
      }
      if (baseUrl) creds.baseUrl = baseUrl;
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
    if (kind === 'beget') {
      // JSON { username (login), password, totpSecret?, apiPassword? }; merge so a partial edit
      // (e.g. adding only the API password) keeps the rest.
      const supplied = dto.username || dto.password || dto.totpSecret || dto.apiPassword;
      if (!supplied) return null;
      const base = this.decodeCredentials(existingEnc);
      const username = dto.username ?? base.username;
      const password = dto.password ?? base.password;
      if (!username || !password) {
        throw new BadRequestException('Provide the Beget account login and password together');
      }
      const creds: Record<string, string> = { username, password };
      const totpSecret = dto.totpSecret ?? base.totpSecret;
      if (totpSecret) creds.totpSecret = totpSecret;
      const apiPassword = dto.apiPassword ?? base.apiPassword;
      if (apiPassword) creds.apiPassword = apiPassword;
      return this.crypto.encrypt(JSON.stringify(creds));
    }
    if (kind === 'cloudflare') {
      // JSON { accountId, apiToken }. `token` carries the API token. Merge so a partial edit works.
      if (!dto.accountId && !dto.token) return null;
      const base = this.decodeCredentials(existingEnc);
      const accountId = dto.accountId ?? base.accountId;
      const apiToken = dto.token ?? base.apiToken;
      if (!accountId || !apiToken) {
        throw new BadRequestException('Provide the Cloudflare account ID and API token together');
      }
      return this.crypto.encrypt(JSON.stringify({ accountId, apiToken }));
    }
    if (kind === 'porkbun') {
      // JSON { apiKey, secretApiKey }. `token` carries the API key. Merge so a partial edit works.
      if (!dto.token && !dto.secretKey) return null;
      const base = this.decodeCredentials(existingEnc);
      const apiKey = dto.token ?? base.apiKey;
      const secretApiKey = dto.secretKey ?? base.secretApiKey;
      if (!apiKey || !secretApiKey) {
        throw new BadRequestException('Provide both the Porkbun API key and secret key');
      }
      return this.crypto.encrypt(JSON.stringify({ apiKey, secretApiKey }));
    }
    if (kind === 'yandex') {
      // `token` carries the service-account authorized key (JSON); parse it into { keyId,
      // serviceAccountId, privateKey }. Scope (folders, billing account) is auto-resolved, never
      // stored. Nothing to merge — an edit without a new key leaves the stored one intact.
      if (!dto.token) return null;
      const key = this.parseYandexKey(dto.token);
      if (!key.keyId || !key.serviceAccountId || !key.privateKey) {
        throw new BadRequestException(
          'Provide the Yandex Cloud service account authorized key (JSON)',
        );
      }
      return this.crypto.encrypt(JSON.stringify(key));
    }
    if (kind !== 'manual' && dto.token) return this.crypto.encrypt(dto.token);
    return null;
  }

  /**
   * Resolve the Yandex scope (folders scanned for servers + billing account) for the form badges,
   * using either the just-entered authorized key (create flow) or the stored credentials of an
   * existing provider (edit flow).
   */
  async discoverYandex(dto: YandexDiscoverDto): Promise<YandexDiscoverResult> {
    const creds = await this.yandexCredsFor(dto);
    const connector = new YandexConnector(creds);
    try {
      return await connector.discover(AbortSignal.timeout(DISCOVER_TIMEOUT_MS));
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Yandex Cloud discovery failed',
      );
    }
  }

  /** Resolve the auth part of the Yandex credentials from a raw key or a stored provider. */
  private async yandexCredsFor(dto: YandexDiscoverDto): Promise<YandexCredentials> {
    if (dto.token) {
      const key = this.parseYandexKey(dto.token);
      if (!key.keyId || !key.serviceAccountId || !key.privateKey) {
        throw new BadRequestException(
          'Provide the Yandex Cloud service account authorized key (JSON)',
        );
      }
      return {
        keyId: key.keyId,
        serviceAccountId: key.serviceAccountId,
        privateKey: key.privateKey,
      };
    }
    if (dto.providerUuid) {
      const existing = await this.providers.findCredentials(dto.providerUuid);
      if (existing?.kind !== 'yandex') {
        throw new NotFoundException('Yandex provider not found');
      }
      const c = this.decodeCredentials(existing.credentialsEnc);
      if (!c.keyId || !c.serviceAccountId || !c.privateKey) {
        throw new BadRequestException('Stored Yandex credentials are incomplete');
      }
      return {
        keyId: c.keyId,
        serviceAccountId: c.serviceAccountId,
        privateKey: c.privateKey,
      };
    }
    throw new BadRequestException('Provide the authorized key or an existing provider');
  }

  /** Parse a Yandex Cloud authorized-key JSON into the fields we sign the JWT with. */
  private parseYandexKey(raw: string): {
    keyId?: string;
    serviceAccountId?: string;
    privateKey?: string;
  } {
    let obj: { id?: string; service_account_id?: string; private_key?: string };
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Yandex Cloud authorized key must be the JSON key file');
    }
    if (!obj.id || !obj.service_account_id || !obj.private_key) {
      throw new BadRequestException(
        'Yandex Cloud authorized key is missing id, service_account_id or private_key',
      );
    }
    return { keyId: obj.id, serviceAccountId: obj.service_account_id, privateKey: obj.private_key };
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
    if (!(await this.providers.exists(uuid))) throw new NotFoundException('Provider not found');
  }
}
