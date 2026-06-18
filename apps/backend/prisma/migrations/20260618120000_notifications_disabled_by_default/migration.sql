-- Notifications are now OFF by default for fresh installs (opt-in in the panel).
ALTER TABLE "settings" ALTER COLUMN "notifications_enabled" SET DEFAULT false;
