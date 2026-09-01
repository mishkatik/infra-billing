import { createZodDto } from 'nestjs-zod';
import {
  accountSchema,
  claimInviteSchema,
  createAccountSchema,
  createdInviteSchema,
  createInviteSchema,
  inviteInfoSchema,
  resetLinkSchema,
  updateAccountSchema,
} from '@infra/shared';

export class AccountDto extends createZodDto(accountSchema) {}
export class CreateAccountDto extends createZodDto(createAccountSchema) {}
export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}
export class CreateInviteDto extends createZodDto(createInviteSchema) {}
export class CreatedInviteDto extends createZodDto(createdInviteSchema) {}
export class ResetLinkDto extends createZodDto(resetLinkSchema) {}
export class InviteInfoDto extends createZodDto(inviteInfoSchema) {}
export class ClaimInviteDto extends createZodDto(claimInviteSchema) {}
