import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProviderAccountsRepository } from '@repositories/provider-accounts/provider-accounts.repository';

export interface AccountOwner {
  accountUuid: string;
  providerUuid: string;
}

/**
 * Resolves the account a manually created service or payment belongs to. The account is named
 * directly; a bare providerUuid still works when that provider has exactly one account, so API
 * scripts written before accounts existed keep working.
 */
export async function resolveAccountOwner(
  accounts: ProviderAccountsRepository,
  ref: { accountUuid?: string; providerUuid?: string },
): Promise<AccountOwner> {
  if (ref.accountUuid) {
    const account = await accounts.findByUuid(ref.accountUuid);
    if (!account) throw new NotFoundException('Account not found');
    if (ref.providerUuid && ref.providerUuid !== account.providerUuid) {
      throw new BadRequestException('Account belongs to another provider');
    }
    return { accountUuid: account.uuid, providerUuid: account.providerUuid };
  }
  if (!ref.providerUuid) throw new BadRequestException('Account is required');
  const list = await accounts.listByProvider(ref.providerUuid);
  if (list.length === 0) throw new NotFoundException('Provider not found');
  if (list.length > 1) {
    throw new BadRequestException('Provider has several accounts, pass accountUuid');
  }
  return { accountUuid: list[0].uuid, providerUuid: ref.providerUuid };
}
