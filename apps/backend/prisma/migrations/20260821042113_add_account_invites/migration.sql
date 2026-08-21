-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "setup_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "setup_token_hash" TEXT,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_setup_token_hash_key" ON "accounts"("setup_token_hash");
