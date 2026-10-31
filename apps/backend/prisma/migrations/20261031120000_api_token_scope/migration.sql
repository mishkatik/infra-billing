-- AlterTable
ALTER TABLE "api_tokens" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'full';
