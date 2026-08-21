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
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM, type Me } from '@infra/shared';
import { AuthService, SESSION_COOKIE } from '../auth/auth.service';
import { MeDto } from '../auth/dto/auth-response.dto';
import { memberPrincipalFromAccount, toMe } from '../auth/principal';
import { Public } from '../auth/public.decorator';
import { SessionOnly } from '../auth/session-only.decorator';
import { AccountsService } from './accounts.service';
import {
  AccountDto,
  ClaimInviteDto,
  CreateAccountDto,
  CreatedInviteDto,
  CreateInviteDto,
  InviteInfoDto,
  ResetLinkDto,
  UpdateAccountDto,
} from './dto/account.dto';

// Admin-only: no @RequirePerm (deny-by-default blocks members), @SessionOnly blocks API tokens.
// The two invite/:token routes are @Public — anonymous invitees have no session yet — and are
// declared first because they're static-prefixed ('invite/…', 'invites') and must be matched
// before the `:uuid` routes below.
@ApiTags(CONTROLLERS_INFO.ACCOUNTS.TAG)
@ApiBearerAuth()
@SessionOnly()
@Controller(API.ACCOUNTS)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
  ) {}

  @Get(API_SUB.ACCOUNT_INVITE_BY_TOKEN)
  @ApiOperation({ summary: 'Get invite/reset link info' })
  @ApiOkResponse({ type: InviteInfoDto })
  @Public()
  inviteInfo(@Param('token') token: string) {
    return this.accounts.getInviteInfo(token);
  }

  @Post(API_SUB.ACCOUNT_INVITE_BY_TOKEN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Claim an invite/reset link' })
  @ApiOkResponse({ type: MeDto })
  @Public()
  async claimInvite(
    @Param('token') token: string,
    @Body() dto: ClaimInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const account = await this.accounts.claimInvite(token, dto);
    // Throws if the invariant that a claimed row always has a username is ever violated.
    const principal = memberPrincipalFromAccount(account);
    res.cookie(
      SESSION_COOKIE,
      await this.auth.sign(principal.username, principal.accountUuid),
      this.auth.cookieOptions(),
    );
    return toMe(principal);
  }

  @Post(API_SUB.ACCOUNT_INVITES)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a pending account and its invite link' })
  @ApiCreatedResponse({ type: CreatedInviteDto })
  createInvite(@Body() dto: CreateInviteDto) {
    return this.accounts.createInvite(dto);
  }

  @Post(API_SUB.ACCOUNT_INVITE_LINK)
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a fresh invite/reset link for an account' })
  @ApiOkResponse({ type: ResetLinkDto })
  issueInviteLink(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.accounts.issueInviteLink(uuid);
  }

  @Get()
  @ApiOperation({ summary: 'List member accounts' })
  @ApiOkResponse({ type: [AccountDto] })
  list() {
    return this.accounts.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a member account' })
  @ApiCreatedResponse({ type: AccountDto })
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Patch(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Update a member account' })
  @ApiOkResponse({ type: AccountDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(uuid, dto);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a member account' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.accounts.remove(uuid);
  }
}
