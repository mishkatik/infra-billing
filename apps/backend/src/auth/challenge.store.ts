import { Injectable } from '@nestjs/common';

type Entry = { challenge: string; expires: number };

const TTL_MS = 60_000;

// One-shot, TTL-bound challenges keyed by ceremony scope. Registration is keyed
// per principal ("register:<owner>") so concurrent admin/member onboarding can't
// clobber each other. Usernameless login has no principal to key on and keeps a
// single "login" slot — two logins racing within the TTL may need one retry.
@Injectable()
export class ChallengeStore {
  private readonly store = new Map<string, Entry>();

  put(scope: string, challenge: string): void {
    this.store.set(scope, { challenge, expires: Date.now() + TTL_MS });
  }

  /** Return the challenge and remove it, or null if missing/expired. */
  take(scope: string): string | null {
    const entry = this.store.get(scope);
    this.store.delete(scope);
    if (!entry || entry.expires < Date.now()) return null;
    return entry.challenge;
  }
}
