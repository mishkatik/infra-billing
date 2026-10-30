-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quiet_hours_end" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "quiet_hours_timezone" TEXT;
