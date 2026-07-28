-- Historical daily FX rates. Separate from `exchange_rates` (whose captured_at is insert time,
-- not the date a rate was in effect) so past spend can be valued at the rate of its payment date.
CREATE TABLE "exchange_rates_daily" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exchange_rates_daily_code_base_date_key" ON "exchange_rates_daily"("code", "base", "rate_date");

CREATE INDEX "exchange_rates_daily_base_date_idx" ON "exchange_rates_daily"("base", "rate_date");
