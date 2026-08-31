import { z } from 'zod';

/** All process env the backend reads, validated at startup. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().min(1),

  // AES-256-GCM key for secrets at rest: provider tokens AND the admin's password hash material /
  // session secret (32 bytes, base64). Root key: must stay in env (can't live in the DB it protects).
  ENCRYPTION_KEY: z.string().min(1),

  // `Secure` flag of the session cookie. Unset → follows NODE_ENV (true in production).
  // `false` is for http-only deployments where the transport is protected elsewhere (WireGuard
  // overlays like Tailscale/NetBird); passkeys still need a real secure context regardless.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // NB: the admin account (username + password hash) lives in the DB `auth_config` row, created on
  // first run in the panel. NOT in env. base currency / rate source / sync interval / Telegram are
  // also in the DB `Settings` row. See AuthConfigService / SettingsService.

  // Build metadata, baked in by the Docker build args (see Dockerfile/Makefile).
  APP_VERSION: z.string().default('dev'),
  BUILD_TIME: z.string().default(''),
  GIT_COMMIT: z.string().default(''),

  // Expose the Swagger UI at /api/docs when enabled (opt-in; public when on).
  DOCS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;
