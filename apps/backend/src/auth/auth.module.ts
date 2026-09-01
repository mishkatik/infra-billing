import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthConfigService } from './auth-config.service';
import { WebAuthnService } from './webauthn.service';
import { ChallengeStore } from './challenge.store';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthConfigService,
    WebAuthnService,
    ChallengeStore,
    // Global guard: protects every /api/* route except those marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AuthConfigService],
})
export class AuthModule {}
