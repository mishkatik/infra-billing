import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { Prisma } from '@generated/prisma/client';
import type { Passkey as PasskeyDto } from '@infra/shared';
import { AccountsRepository } from '@repositories/accounts/accounts.repository';
import { PasskeysRepository } from '@repositories/passkeys/passkeys.repository';
import type { LoginResult } from './auth.service';
import { AuthConfigService } from './auth-config.service';
import { ChallengeStore } from './challenge.store';
import { nextPasskeyName } from './passkey-name.util';
import type { Principal } from './principal';

type AuthConfigRow = Prisma.AuthConfigGetPayload<Record<string, never>>;
type PasskeyRow = Prisma.PasskeyGetPayload<Record<string, never>>;

// Thin wrapper around @simplewebauthn/server. Persists passkeys and owns the passkey lockout guard.
@Injectable()
export class WebAuthnService {
  constructor(
    private readonly passkeys: PasskeysRepository,
    private readonly authConfig: AuthConfigService,
    private readonly challenges: ChallengeStore,
    private readonly accountsRepo: AccountsRepository,
  ) {}

  // ---- registration (authenticated owner adding a key) ----

  async registerOptions(principal: Principal): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const row = await this.authConfig.requireRow();
    const { rpId, rpName } = this.requireRp(row);
    const owner = await this.resolveOwner(principal, row);
    const existing = await this.passkeys.listByOwner(owner.accountUuid);
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userName: owner.username,
      userID: owner.webauthnUserId,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: splitTransports(p.transports),
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    this.challenges.put(this.registerScope(principal), options.challenge);
    return options;
  }

  async verifyRegistration(
    principal: Principal,
    response: RegistrationResponseJSON,
    name?: string,
  ): Promise<PasskeyDto> {
    const row = await this.authConfig.requireRow();
    const { rpId, origins } = this.requireRp(row);
    const challenge = this.challenges.take(this.registerScope(principal));
    if (!challenge) throw new BadRequestException('Registration challenge expired — start again');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpId,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified');
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const owner = await this.resolveOwner(principal, row);
    // No explicit name → auto-name "Passkey", "Passkey 2", … (next free slot).
    let label = name?.trim();
    if (!label) {
      label = nextPasskeyName(await this.passkeys.listNamesByOwner(owner.accountUuid));
    }
    const created = await this.passkeys.create({
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: BigInt(credential.counter),
      transports: credential.transports?.join(',') ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: label,
      ...(owner.accountUuid ? { account: { connect: { uuid: owner.accountUuid } } } : {}),
    });
    return toPasskeyDto(created);
  }

  // ---- authentication (public, passwordless login) ----

  async loginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const row = await this.authConfig.requireRow();
    const adminKeys = await this.passkeys.countByOwner(null);
    const memberKeys = await this.passkeys.countMembers();
    const adminUsable = row.passkeyEnabled && adminKeys > 0;
    if (!adminUsable && memberKeys === 0) {
      throw new UnauthorizedException('Passkey login is disabled');
    }
    const { rpId } = this.requireRp(row);
    // Discoverable credentials: the platform picks the key; the credential resolves the owner.
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      userVerification: 'preferred',
      allowCredentials: [],
    });
    this.challenges.put('login', options.challenge);
    return options;
  }

  async verifyLogin(response: AuthenticationResponseJSON): Promise<LoginResult> {
    const row = await this.authConfig.requireRow();
    const { rpId, origins } = this.requireRp(row);
    const challenge = this.challenges.take('login');
    if (!challenge) throw new BadRequestException('Login challenge expired — try again');
    const passkey = await this.passkeys.findByCredentialId(response.id);
    if (!passkey) throw new UnauthorizedException('Unknown passkey');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpId,
      requireUserVerification: false,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: Number(passkey.counter),
        transports: splitTransports(passkey.transports),
      },
    });
    if (!verification.verified) throw new UnauthorizedException('Passkey verification failed');
    const newCounter = verification.authenticationInfo.newCounter;
    // Counter regression hints at a cloned authenticator. Platform passkeys commonly report 0, so
    // only reject when a real (non-zero) counter went backwards.
    if (newCounter !== 0 && newCounter <= Number(passkey.counter)) {
      throw new UnauthorizedException('Passkey counter regression');
    }
    let result: LoginResult;
    if (passkey.accountUuid == null) {
      if (!row.passkeyEnabled) throw new UnauthorizedException('Passkey login is disabled');
      result = { username: row.username, account: null };
    } else {
      const account = await this.accountsRepo.findByUuid(passkey.accountUuid);
      // A pending (unclaimed) account can't hold a passkey — registration requires an
      // authenticated session, which requires a completed claim — but stay defensive.
      if (!account || account.disabled || account.username == null) {
        throw new UnauthorizedException('Account is disabled');
      }
      result = { username: account.username, account };
    }
    // Persist counter/lastUsedAt only after every refusal check: a refused login must
    // leave no trace on the credential (lastUsedAt is the user's audit signal).
    await this.passkeys.recordLogin(passkey.uuid, BigInt(newCounter));
    return result;
  }

  // ---- management (authenticated) ----

  async list(principal: Principal): Promise<PasskeyDto[]> {
    const owner = principal.kind === 'member' ? principal.accountUuid : null;
    const rows = await this.passkeys.listByOwner(owner);
    return rows.map(toPasskeyDto);
  }

  async delete(principal: Principal, uuid: string): Promise<void> {
    const owner = principal.kind === 'member' ? principal.accountUuid : null;
    const passkey = await this.passkeys.findByUuid(uuid);
    if (!passkey || passkey.accountUuid !== owner) throw new NotFoundException('Passkey not found');
    if (principal.kind === 'admin') {
      const row = await this.authConfig.requireRow();
      // Don't let the owner delete their only passkey when password login is off (lockout).
      if (!row.passwordEnabled && (await this.passkeys.countByOwner(null)) <= 1) {
        throw new BadRequestException(
          'Cannot delete the last passkey while password login is disabled',
        );
      }
    }
    // Members always keep password login — no lockout guard needed.
    await this.passkeys.delete(uuid);
  }

  /** Challenge-store scope key for a registration ceremony, keyed per principal. */
  private registerScope(principal: Principal): string {
    return principal.kind === 'member' ? `register:${principal.accountUuid}` : 'register:admin';
  }

  /** Resolve the passkey owner (admin row or member account) for register/verify flows. */
  private async resolveOwner(
    principal: Principal,
    row: AuthConfigRow,
  ): Promise<{
    accountUuid: string | null;
    username: string;
    webauthnUserId: Prisma.Bytes | undefined;
  }> {
    if (principal.kind === 'admin') {
      // Admin rows may predate webauthn_user_id — stay null-tolerant like the current code.
      return {
        accountUuid: null,
        username: row.username,
        webauthnUserId: row.webauthnUserId ?? undefined,
      };
    }
    const account = await this.accountsRepo.findByUuid(principal.accountUuid);
    // Same defensive null-username check as verifyLogin — an authenticated member principal
    // implies a completed claim, but resolveOwner shouldn't assume that without checking.
    if (!account || account.disabled || account.username == null) throw new UnauthorizedException();
    return {
      accountUuid: account.uuid,
      username: account.username,
      webauthnUserId: account.webauthnUserId,
    };
  }

  /** Resolve the Relying Party config from the admin row, or fail with a clear hint. */
  private requireRp(row: AuthConfigRow): { rpId: string; rpName: string; origins: string[] } {
    if (!row.rpId || !row.rpOrigin) {
      throw new BadRequestException(
        'Configure passkey settings (Relying Party ID and Origin) before using passkeys',
      );
    }
    return {
      rpId: row.rpId,
      rpName: row.rpName || row.rpId,
      // rpOrigin may be a comma-separated list when the panel is reachable on several hostnames.
      origins: row.rpOrigin
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
}

function splitTransports(csv: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[];
}

function toPasskeyDto(row: PasskeyRow): PasskeyDto {
  return {
    uuid: row.uuid,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}
