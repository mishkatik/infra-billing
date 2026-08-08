-- Optional gate: tariff estimate only counts services created by each month.
ALTER TABLE "settings" ADD COLUMN "forecast_tariff_backfill_respect_created_at" BOOLEAN NOT NULL DEFAULT false;
