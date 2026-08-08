-- Forecast chart: optional tariff backfill for months without payment ledger coverage.
ALTER TABLE "settings" ADD COLUMN "forecast_tariff_backfill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "forecast_tariff_backfill_force" BOOLEAN NOT NULL DEFAULT false;
