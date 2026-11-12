import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SessionOnly } from '../auth/session-only.decorator';
import { ProviderAccountsService } from './provider-accounts.service';
import {
  DuplicatePaymentsDto,
  ProviderAccountDto,
  RemoveDuplicatePaymentsDto,
  RemoveDuplicatePaymentsResultDto,
  UpdateProviderAccountDto,
} from './dto/provider-account.dto';
import { ProviderCredentialsRevealDto } from './dto/provider.dto';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.PROVIDER_ACCOUNTS.TAG)
@Controller(API.PROVIDER_ACCOUNTS)
export class ProviderAccountsController {
  constructor(private readonly accounts: ProviderAccountsService) {}

  // Returns decrypted secrets, so it stays off-limits to API tokens: those are unscoped and live in
  // scripts, and a leaked one must not be able to drain every hoster password and TOTP seed.
  @SessionOnly()
  @Get(API_SUB.ACCOUNT_CREDENTIALS_REVEAL)
  @ApiOperation({ summary: 'Reveal stored account credentials (explicit reveal, session only)' })
  @ApiOkResponse({ type: ProviderCredentialsRevealDto })
  revealCredentials(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.accounts.revealCredentials(uuid);
  }

  @Patch(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Update an account (label, enabled, postpaid, credentials)' })
  @ApiOkResponse({ type: ProviderAccountDto })
  @ApiConflictResponse({ description: 'Another account of the provider has that label' })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateProviderAccountDto) {
    return this.accounts.update(uuid, dto);
  }

  @Get(API_SUB.ACCOUNT_DUPLICATE_PAYMENTS)
  @ApiOperation({
    summary: 'Manual payments that an import has since brought in too (same type, amount, ±3 days)',
  })
  @ApiOkResponse({ type: DuplicatePaymentsDto })
  duplicatePayments(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.accounts.duplicatePayments(uuid);
  }

  @Post(API_SUB.ACCOUNT_DUPLICATE_PAYMENTS_REMOVE)
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove chosen manual duplicates of imported payments' })
  @ApiOkResponse({ type: RemoveDuplicatePaymentsResultDto })
  removeDuplicatePayments(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Body() dto: RemoveDuplicatePaymentsDto,
  ) {
    return this.accounts.removeDuplicatePayments(uuid, dto.paymentUuids);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an account' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'It is the last account of the provider' })
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.accounts.remove(uuid);
  }
}
