-- AlterTable
ALTER TABLE "passkeys" ADD COLUMN     "account_uuid" TEXT;

-- CreateTable
CREATE TABLE "account_projects" (
    "account_uuid" TEXT NOT NULL,
    "project_uuid" TEXT NOT NULL,

    CONSTRAINT "account_projects_pkey" PRIMARY KEY ("account_uuid","project_uuid")
);

-- CreateTable
CREATE TABLE "accounts" (
    "uuid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webauthn_user_id" BYTEA NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE INDEX "account_projects_project_uuid_idx" ON "account_projects"("project_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key" ON "accounts"("username");

-- CreateIndex
CREATE INDEX "passkeys_account_uuid_idx" ON "passkeys"("account_uuid");

-- AddForeignKey
ALTER TABLE "account_projects" ADD CONSTRAINT "account_projects_account_uuid_fkey" FOREIGN KEY ("account_uuid") REFERENCES "accounts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_projects" ADD CONSTRAINT "account_projects_project_uuid_fkey" FOREIGN KEY ("project_uuid") REFERENCES "projects"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_account_uuid_fkey" FOREIGN KEY ("account_uuid") REFERENCES "accounts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
