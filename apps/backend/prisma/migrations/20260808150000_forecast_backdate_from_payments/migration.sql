-- When Created is after the first payment, optionally backdate tariff estimate to that payment month.
ALTER TABLE "settings" ADD COLUMN "forecast_tariff_backfill_backdate_from_payments" BOOLEAN NOT NULL DEFAULT false;
