import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import {
  ProviderAccount as ProviderAccountDto,
  Provider as ProviderDto,
  Service as ServiceDto,
  YandexDiscoverResult,
} from '@infra/shared';
import { ProviderAccountsRepository } from '@repositories/provider-accounts/provider-accounts.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { YandexConnector } from '../connectors/yandex/yandex.connector';
import type { YandexCredentials } from '../connectors/yandex/yandex.types';
import { FaviconsService } from '../favicons/favicons.service';
import { mapProvider, mapProviderAccount, mapService } from '@common/mappers';
import { ProviderCredentialsService } from './provider-credentials.service';
import { labelTaken, mergeError, mergedIdentity, mergedLabels } from './provider-rules';
import {
  CreateProviderDto,
  MergeProviderDto,
  UpdateProviderDto,
  YandexDiscoverDto,
} from './dto/provider.dto';
import { CreateProviderAccountDto } from './dto/provider-account.dto';

// Cap the discovery call so a hanging Yandex API request can't wedge the request handler.
const DISCOVER_TIMEOUT_MS = 20_000;

type ProviderWithAccounts = NonNullable<
  Awaited<ReturnType<ProvidersRepository['findWithAccounts']>>
>;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly providers: ProvidersRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly credentials: ProviderCredentialsService,
    private readonly favicons: FaviconsService,
  ) {}

  async list(): Promise<ProviderDto[]> {
    const rows = await this.providers.listWithAccounts();
    return rows.map((r) => this.toDto(r));
  }

  async getWithServices(uuid: string): Promise<ProviderDto & { services: ServiceDto[] }> {
    const p = await this.providers.findWithServices(uuid);
    if (!p) throw new NotFoundException('Provider not found');
    const services = p.accounts
      .flatMap((a) => a.services)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { ...this.toDto(p), services: services.map(mapService) };
  }

  /** Creates the provider together with its first account. */
  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const account = dto.account ?? {};
    const p = await this.providers.create({
      name: dto.name,
      kind: dto.kind,
      loginUrl: dto.loginUrl ?? null,
      iconName: dto.iconName ?? null,
      iconBg: dto.iconBg ?? null,
      accounts: {
        create: {
          label: account.label ?? null,
          isPostpaid: account.isPostpaid ?? false,
          credentialsEnc: this.credentials.buildCredentials(dto.kind, account),
        },
      },
    });
    return this.toDto(p);
  }

  /** Identity only; account settings and credentials are edited through the account routes. */
  async update(uuid: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    await this.ensureExists(uuid);
    const data: Prisma.ProviderUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.loginUrl !== undefined) data.loginUrl = dto.loginUrl;
    if (dto.iconName !== undefined) data.iconName = dto.iconName;
    if (dto.iconBg !== undefined) data.iconBg = dto.iconBg;
    const p = await this.providers.update(uuid, data);
    if (dto.loginUrl !== undefined) this.favicons.invalidateProvider(uuid);
    return this.toDto(p);
  }

  async remove(uuid: string): Promise<void> {
    await this.ensureExists(uuid);
    await this.providers.delete(uuid);
    this.favicons.invalidateProvider(uuid);
  }

  /** Adds another account at the same hoster; the label must be unique within the provider. */
  async addAccount(
    providerUuid: string,
    dto: CreateProviderAccountDto,
  ): Promise<ProviderAccountDto> {
    const p = await this.findWithAccounts(providerUuid);
    if (labelTaken(p.accounts, dto.label)) {
      throw new ConflictException('This provider already has an account with that label');
    }
    const a = await this.accounts.create({
      providerUuid,
      label: dto.label,
      isPostpaid: dto.isPostpaid ?? false,
      credentialsEnc: this.credentials.buildCredentials(p.kind, dto),
    });
    return mapProviderAccount(a, this.credentials.hints(p.kind, a.credentialsEnc));
  }

  /**
   * Folds the source provider into a target of the same kind: every source account (with its
   * services, payments, balance history and sync log) moves over, the target keeps its identity
   * and only borrows the fields it lacks, and the source is deleted.
   */
  async merge(sourceUuid: string, dto: MergeProviderDto): Promise<ProviderDto> {
    const source = await this.findWithAccounts(sourceUuid);
    const target = await this.findWithAccounts(dto.targetProviderUuid);
    const error = mergeError(source, target);
    if (error) throw new BadRequestException(error);
    const merged = await this.providers.merge(
      source.uuid,
      target.uuid,
      mergedLabels(source.name, source.accounts, target.accounts),
      mergedIdentity(source, target),
    );
    this.favicons.invalidateProvider(source.uuid);
    this.favicons.invalidateProvider(target.uuid);
    return this.toDto(merged);
  }

  /**
   * Resolve the Yandex scope (folders scanned for servers + billing account) for the form badges,
   * using either the just-entered authorized key (create flow) or the stored credentials of an
   * existing account (edit flow).
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

  private async yandexCredsFor(dto: YandexDiscoverDto): Promise<YandexCredentials> {
    if (dto.token) return this.credentials.yandexCredsFromKey(dto.token);
    if (dto.accountUuid) {
      const existing = await this.accounts.findCredentials(dto.accountUuid);
      if (existing?.provider.kind !== 'yandex') {
        throw new NotFoundException('Yandex account not found');
      }
      return this.credentials.yandexCredsFromStored(existing.credentialsEnc);
    }
    throw new BadRequestException('Provide the authorized key or an existing account');
  }

  private toDto(p: ProviderWithAccounts): ProviderDto {
    return mapProvider(p, (a) => this.credentials.hints(p.kind, a.credentialsEnc));
  }

  private async findWithAccounts(uuid: string): Promise<ProviderWithAccounts> {
    const p = await this.providers.findWithAccounts(uuid);
    if (!p) throw new NotFoundException('Provider not found');
    return p;
  }

  private async ensureExists(uuid: string): Promise<void> {
    if (!(await this.providers.exists(uuid))) throw new NotFoundException('Provider not found');
  }
}
