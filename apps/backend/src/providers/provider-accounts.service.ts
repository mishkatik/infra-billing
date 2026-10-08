import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { ProviderAccount as ProviderAccountDto, ProviderCredentialsReveal } from '@infra/shared';
import { ProviderAccountsRepository } from '@repositories/provider-accounts/provider-accounts.repository';
import { mapProviderAccount } from '@common/mappers';
import { ProviderCredentialsService } from './provider-credentials.service';
import { labelTaken } from './provider-rules';
import { UpdateProviderAccountDto } from './dto/provider-account.dto';

@Injectable()
export class ProviderAccountsService {
  constructor(
    private readonly accounts: ProviderAccountsRepository,
    private readonly credentials: ProviderCredentialsService,
  ) {}

  async update(uuid: string, dto: UpdateProviderAccountDto): Promise<ProviderAccountDto> {
    const existing = await this.accounts.findByUuid(uuid);
    if (!existing) throw new NotFoundException('Account not found');
    const { kind } = existing.provider;
    const data: Prisma.ProviderAccountUpdateInput = {};
    if (dto.label !== undefined && dto.label !== existing.label) {
      const siblings = await this.accounts.listByProvider(existing.providerUuid);
      if (labelTaken(siblings, dto.label, uuid)) {
        throw new ConflictException('This provider already has an account with that label');
      }
      data.label = dto.label;
    }
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.isPostpaid !== undefined) data.isPostpaid = dto.isPostpaid;
    // Merge onto existing credentials so a partial edit works, e.g. adding only a TOTP
    // secret to an existing BILLmanager account without re-entering the password.
    const creds = this.credentials.buildCredentials(kind, dto, existing.credentialsEnc);
    if (creds !== null) data.credentialsEnc = creds;
    const a = await this.accounts.update(uuid, data);
    return mapProviderAccount(a, this.credentials.hints(kind, a.credentialsEnc));
  }

  /** A provider always keeps at least one account; removing the last one means deleting it. */
  async remove(uuid: string): Promise<void> {
    const existing = await this.accounts.findByUuid(uuid);
    if (!existing) throw new NotFoundException('Account not found');
    if (!(await this.accounts.deleteUnlessLast(uuid, existing.providerUuid))) {
      throw new ConflictException('Cannot delete the only account; delete the provider instead');
    }
  }

  /** Decrypt stored secrets for an explicit reveal (edit form eye toggle). */
  async revealCredentials(uuid: string): Promise<ProviderCredentialsReveal> {
    const existing = await this.accounts.findCredentials(uuid);
    if (!existing) throw new NotFoundException('Account not found');
    return this.credentials.reveal(existing.provider.kind, existing.credentialsEnc);
  }
}
