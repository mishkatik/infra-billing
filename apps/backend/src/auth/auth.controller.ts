import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { API, API_SUB } from '@infra/shared';
import { Request, Response } from 'express';
import { Me } from '@infra/shared';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { LoginDto } from './login.dto';
import { Public } from './public.decorator';

@Controller(API.AUTH)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post(API_SUB.AUTH_LOGIN)
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Me {
    if (!this.auth.verifyCredentials(dto.username, dto.password)) {
      throw new UnauthorizedException('Invalid username or password');
    }
    res.cookie(SESSION_COOKIE, this.auth.sign(dto.username), this.auth.cookieOptions());
    return { username: dto.username };
  }

  @Public()
  @Post(API_SUB.AUTH_LOGOUT)
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.auth.cookieOptions());
  }

  @Get(API_SUB.AUTH_ME)
  me(@Req() req: Request & { user?: string }): Me {
    return { username: req.user ?? '' };
  }
}
