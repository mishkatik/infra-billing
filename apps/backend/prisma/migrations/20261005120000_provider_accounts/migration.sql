-- A provider is now the hoster identity; credentials, balance and sync state move to accounts, so
-- one hoster can hold several logins. Every existing provider becomes a provider with exactly one
-- (unlabelled) account, which keeps all totals and history unchanged.

-- CreateTable
CREATE TABLE "provider_accounts" (
    "uuid" TEXT NOT NULL,
    "provider_uuid" TEXT NOT NULL,
    "label" TEXT,
    "credentials_enc" BYTEA,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_postpaid" BOOLEAN NOT NULL DEFAULT false,
    "balance" DECIMAL(14,2),
    "balance_currency" TEXT,
    "balance_synced_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_accounts_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_accounts_uuid_provider_uuid_key" ON "provider_accounts"("uuid", "provider_uuid");
CREATE INDEX "provider_accounts_provider_uuid_idx" ON "provider_accounts"("provider_uuid");

-- AddForeignKey
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_provider_uuid_fkey" FOREIGN KEY ("provider_uuid") REFERENCES "providers"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- One account per provider. The encrypted credentials blob is not bound to the row, so it moves as is.
INSERT INTO "provider_accounts" (
    "uuid", "provider_uuid", "label", "credentials_enc", "is_enabled", "is_postpaid", "balance",
    "balance_currency", "balance_synced_at", "last_sync_at", "last_sync_error", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, p."uuid", NULL, p."credentials_enc", p."is_enabled", p."is_postpaid",
    p."balance", p."balance_currency", p."balance_synced_at", p."last_sync_at", p."last_sync_error",
    p."created_at", p."updated_at"
FROM "providers" p;

-- services: add account_uuid, backfill, then key sync dedup and the FK on the account.
ALTER TABLE "services" ADD COLUMN "account_uuid" TEXT;
UPDATE "services" s SET "account_uuid" = a."uuid" FROM "provider_accounts" a WHERE a."provider_uuid" = s."provider_uuid";
ALTER TABLE "services" ALTER COLUMN "account_uuid" SET NOT NULL;
DROP INDEX "services_provider_external_id_key";
CREATE UNIQUE INDEX "services_account_external_id_key" ON "services"("account_uuid", "external_id");
ALTER TABLE "services" DROP CONSTRAINT "services_provider_uuid_fkey";
ALTER TABLE "services" ADD CONSTRAINT "services_account_provider_fkey" FOREIGN KEY ("account_uuid", "provider_uuid") REFERENCES "provider_accounts"("uuid", "provider_uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- payments: same as services.
ALTER TABLE "payments" ADD COLUMN "account_uuid" TEXT;
UPDATE "payments" p SET "account_uuid" = a."uuid" FROM "provider_accounts" a WHERE a."provider_uuid" = p."provider_uuid";
ALTER TABLE "payments" ALTER COLUMN "account_uuid" SET NOT NULL;
DROP INDEX "payments_provider_external_id_key";
CREATE UNIQUE INDEX "payments_account_external_id_key" ON "payments"("account_uuid", "external_id");
ALTER TABLE "payments" DROP CONSTRAINT "payments_provider_uuid_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_provider_fkey" FOREIGN KEY ("account_uuid", "provider_uuid") REFERENCES "provider_accounts"("uuid", "provider_uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- balance_snapshots: re-keyed to the account.
ALTER TABLE "balance_snapshots" ADD COLUMN "account_uuid" TEXT;
UPDATE "balance_snapshots" b SET "account_uuid" = a."uuid" FROM "provider_accounts" a WHERE a."provider_uuid" = b."provider_uuid";
ALTER TABLE "balance_snapshots" ALTER COLUMN "account_uuid" SET NOT NULL;
ALTER TABLE "balance_snapshots" DROP CONSTRAINT "balance_snapshots_provider_uuid_fkey";
DROP INDEX "balance_snapshots_provider_captured_idx";
ALTER TABLE "balance_snapshots" DROP COLUMN "provider_uuid";
CREATE INDEX "balance_snapshots_account_captured_idx" ON "balance_snapshots"("account_uuid", "captured_at");
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_uuid_fkey" FOREIGN KEY ("account_uuid") REFERENCES "provider_accounts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- sync_runs: re-keyed to the account.
ALTER TABLE "sync_runs" ADD COLUMN "account_uuid" TEXT;
UPDATE "sync_runs" r SET "account_uuid" = a."uuid" FROM "provider_accounts" a WHERE a."provider_uuid" = r."provider_uuid";
ALTER TABLE "sync_runs" ALTER COLUMN "account_uuid" SET NOT NULL;
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_provider_uuid_fkey";
DROP INDEX "sync_runs_provider_started_idx";
ALTER TABLE "sync_runs" DROP COLUMN "provider_uuid";
CREATE INDEX "sync_runs_account_started_idx" ON "sync_runs"("account_uuid", "started_at");
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_account_uuid_fkey" FOREIGN KEY ("account_uuid") REFERENCES "provider_accounts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Runway and sync-error alerts are now keyed by account; carry the keys over so the 24h throttle
-- doesn't re-send every alert right after the upgrade.
UPDATE "notification_log" n SET "dedup_key" = split_part(n."dedup_key", ':', 1) || ':' || a."uuid"
FROM "provider_accounts" a
WHERE n."dedup_key" IN ('runway:' || a."provider_uuid", 'sync-error:' || a."provider_uuid");

-- providers: drop what moved to the accounts.
ALTER TABLE "providers" DROP COLUMN "credentials_enc",
DROP COLUMN "balance",
DROP COLUMN "balance_currency",
DROP COLUMN "balance_synced_at",
DROP COLUMN "is_postpaid",
DROP COLUMN "is_enabled",
DROP COLUMN "last_sync_at",
DROP COLUMN "last_sync_error";
