import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  API,
  API_SUB,
  type AuthConfig,
  CONTROLLERS_INFO,
  ID_PARAM,
  type Me,
  type Passkey,
  type SetupStatus,
} from '@infra/shared';
import { Response } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { AuthConfigService } from './auth-config.service';
import { WebAuthnService } from './webauthn.service';
import { LoginDto } from './login.dto';
import { SetupDto } from './dto/setup.dto';
import { UpdateAuthConfigDto } from './dto/update-auth-config.dto';
import { PasskeyRegisterVerifyDto } from './dto/passkey-register-verify.dto';
import { PasskeyLoginVerifyDto } from './dto/passkey-login-verify.dto';
import { AuthConfigDto, MeDto, PasskeyDto, SetupStatusDto } from './dto/auth-response.dto';
import { AnyPrincipal } from './any-principal.decorator';
import { CurrentPrincipal } from './principal.decorator';
import { loginResultToPrincipal, toMe, type Principal } from './principal';
import { Public } from './public.decorator';
import { SessionOnly } from './session-only.decorator';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

// Session-only: a token must not manage credentials or change auth settings. @ApiBearerAuth is
// per-method (not on the class) so the @Public login routes stay unlocked in the docs.
@ApiTags(CONTROLLERS_INFO.AUTH.TAG)
@SessionOnly()
@Controller(API.AUTH)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authConfig: AuthConfigService,
    private readonly webauthn: WebAuthnService,
  ) {}

  @ApiOperation({ summary: 'Get setup status' })
  @ApiOkResponse({ type: SetupStatusDto })
  @Public()
  @Get(API_SUB.AUTH_SETUP)
  setupStatus(): Promise<SetupStatus> {
    return this.authConfig.getStatus();
  }

  @ApiOperation({ summary: 'Complete initial setup' })
  @ApiOkResponse({ type: MeDto })
  @Public()
  @Post(API_SUB.AUTH_SETUP)
  @HttpCode(200)
  async setup(@Body() dto: SetupDto, @Res({ passthrough: true }) res: Response): Promise<Me> {
    await this.authConfig.setup(dto.username, dto.password);
    res.cookie(SESSION_COOKIE, await this.auth.sign(dto.username), this.auth.cookieOptions());
    return { username: dto.username, role: 'admin', permissions: [], projectUuids: null };
  }

  @ApiOperation({ summary: 'Log in with credentials' })
  @ApiOkResponse({ type: MeDto })
  @Public()
  @Post(API_SUB.AUTH_LOGIN)
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<Me> {
    const result = await this.auth.verifyLogin(dto.username, dto.password);
    if (!result) throw new UnauthorizedException('Invalid username or password');
    res.cookie(
      SESSION_COOKIE,
      await this.auth.sign(result.username, result.account?.uuid),
      this.auth.cookieOptions(),
    );
    return toMe(loginResultToPrincipal(result));
  }

  @ApiOperation({ summary: 'Log out current session' })
  @ApiNoContentResponse()
  @Public()
  @Post(API_SUB.AUTH_LOGOUT)
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.auth.cookieOptions());
  }

  @ApiOperation({ summary: 'Get passkey login options' })
  @Public()
  @Post(API_SUB.AUTH_PASSKEY_LOGIN_OPTIONS)
  @HttpCode(200)
  passkeyLoginOptions(): Promise<unknown> {
    return this.webauthn.loginOptions();
  }

  @ApiOperation({ summary: 'Verify passkey login' })
  @ApiOkResponse({ type: MeDto })
  @Public()
  @Post(API_SUB.AUTH_PASSKEY_LOGIN_VERIFY)
  @HttpCode(200)
  async passkeyLoginVerify(
    @Body() dto: PasskeyLoginVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const result = await this.webauthn.verifyLogin(dto.response as AuthenticationResponseJSON);
    res.cookie(
      SESSION_COOKIE,
      await this.auth.sign(result.username, result.account?.uuid),
      this.auth.cookieOptions(),
    );
    return toMe(loginResultToPrincipal(result));
  }

  @ApiOperation({ summary: 'Get current user' })
  @ApiOkResponse({ type: MeDto })
  @ApiBearerAuth()
  @AnyPrincipal()
  @Get(API_SUB.AUTH_ME)
  me(@CurrentPrincipal() principal: Principal): Me {
    return toMe(principal);
  }

  @ApiOperation({ summary: 'Get auth config' })
  @ApiOkResponse({ type: AuthConfigDto })
  @ApiBearerAuth()
  @Get(API_SUB.AUTH_CONFIG)
  getConfig(): Promise<AuthConfig> {
    return this.authConfig.getConfig();
  }

  @ApiOperation({ summary: 'Update auth config' })
  @ApiOkResponse({ type: AuthConfigDto })
  @ApiBearerAuth()
  @Patch(API_SUB.AUTH_CONFIG)
  updateConfig(@Body() dto: UpdateAuthConfigDto): Promise<AuthConfig> {
    return this.authConfig.patchConfig(dto);
  }

  @ApiOperation({ summary: 'Get passkey register options' })
  @ApiBearerAuth()
  @AnyPrincipal()
  @Post(API_SUB.AUTH_PASSKEY_REGISTER_OPTIONS)
  @HttpCode(200)
  passkeyRegisterOptions(@CurrentPrincipal() principal: Principal): Promise<unknown> {
    return this.webauthn.registerOptions(principal);
  }

  @ApiOperation({ summary: 'Verify passkey registration' })
  @ApiOkResponse({ type: PasskeyDto })
  @ApiBearerAuth()
  @AnyPrincipal()
  @Post(API_SUB.AUTH_PASSKEY_REGISTER_VERIFY)
  @HttpCode(200)
  passkeyRegisterVerify(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: PasskeyRegisterVerifyDto,
  ): Promise<Passkey> {
    return this.webauthn.verifyRegistration(
      principal,
      dto.response as RegistrationResponseJSON,
      dto.name,
    );
  }

  @ApiOperation({ summary: 'List passkeys' })
  @ApiOkResponse({ type: [PasskeyDto] })
  @ApiBearerAuth()
  @AnyPrincipal()
  @Get(API_SUB.AUTH_PASSKEYS)
  listPasskeys(@CurrentPrincipal() principal: Principal): Promise<Passkey[]> {
    return this.webauthn.list(principal);
  }

  @ApiOperation({ summary: 'Delete a passkey' })
  @ApiNoContentResponse()
  @ApiBearerAuth()
  @AnyPrincipal()
  @Delete(API_SUB.AUTH_PASSKEY_BY_ID)
  @HttpCode(204)
  deletePasskey(
    @CurrentPrincipal() principal: Principal,
    @Param(ID_PARAM) uuid: string,
  ): Promise<void> {
    return this.webauthn.delete(principal, uuid);
  }
}
