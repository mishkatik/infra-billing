-- Move API tokens from plaintext to a SHA-256 hash. The raw value is now shown once at creation
-- and never stored. Existing tokens are re-hashed in place so they keep authenticating.
ALTER TABLE "api_tokens" ADD COLUMN "token_hash" TEXT;
ALTER TABLE "api_tokens" ADD COLUMN "token_prefix" TEXT;

-- Backfill from the existing plaintext token (Postgres sha256 == Node createHash('sha256'), verified).
UPDATE "api_tokens"
   SET "token_hash" = encode(sha256("token"::bytea), 'hex'),
       "token_prefix" = left("token", 11)
 WHERE "token" IS NOT NULL;

-- Drop the plaintext column so no raw token remains at rest.
ALTER TABLE "api_tokens" DROP COLUMN "token";

ALTER TABLE "api_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
ALTER TABLE "api_tokens" ALTER COLUMN "token_prefix" SET NOT NULL;
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");
