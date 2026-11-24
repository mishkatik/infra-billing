WITH "daily" AS (
  DELETE FROM "payments" p
  USING "providers" pr
  WHERE pr."uuid" = p."provider_uuid"
    AND pr."kind" = 'gcore'
    AND p."type" = 'charge'
    AND p."external_id" ~ '^expense:\d+:[A-Z]+:\d{4}-\d{2}-\d{2}$'
  RETURNING p.*
)
INSERT INTO "payments" (
  "uuid", "provider_uuid", "account_uuid", "service_uuid", "amount", "currency", "description",
  "payment_date", "type", "external_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  "provider_uuid",
  "account_uuid",
  (array_agg("service_uuid" ORDER BY "payment_date" DESC) FILTER (WHERE "service_uuid" IS NOT NULL))[1],
  SUM("amount"),
  "currency",
  (array_agg("description" ORDER BY "payment_date" DESC))[1],
  date_trunc('month', MIN("payment_date")),
  'charge',
  left("external_id", -3),
  MIN("created_at"),
  CURRENT_TIMESTAMP
FROM "daily"
GROUP BY "provider_uuid", "account_uuid", "currency", left("external_id", -3);
