DROP INDEX IF EXISTS "waiter_cash_days_date_desk_uq";

CREATE INDEX IF NOT EXISTS "waiter_cash_days_date_desk_idx"
  ON "waiter_cash_days" USING btree ("business_date", "cash_desk");

CREATE UNIQUE INDEX IF NOT EXISTS "waiter_cash_days_one_open_per_desk_uq"
  ON "waiter_cash_days" USING btree ("cash_desk")
  WHERE "status" = 'OPEN';

-- Saldo przenoszone oznacza pełny stan fizycznie policzony przy zamknięciu.
-- Podział na szufladę i kopertę pozostaje w protokole zamknięcia.
WITH latest_closings AS (
  SELECT DISTINCT ON ("cash_day_id")
    "cash_day_id",
    "counted_cash"
  FROM "waiter_settlements"
  WHERE "checkpoint_type" = 'CLOSE'
  ORDER BY "cash_day_id", "submitted_at" DESC, "id" DESC
)
UPDATE "waiter_cash_days" AS day
SET
  "final_cash_left" = closing."counted_cash",
  "updated_at" = now()
FROM latest_closings AS closing
WHERE day."id" = closing."cash_day_id"
  AND day."status" = 'CLOSED';

-- Napraw także cykl otwarty przed wdrożeniem tej zmiany. Dzięki temu ekran
-- od razu pokaże prawidłowe saldo z ostatniego zamknięcia.
WITH open_carryovers AS (
  SELECT
    current_day."id" AS "cash_day_id",
    previous_day."id" AS "previous_cash_day_id",
    previous_day."final_cash_left",
    previous_day."closed_by_dotykacka_id",
    previous_day."closed_by_name",
    previous_day."closed_at"
  FROM "waiter_cash_days" AS current_day
  CROSS JOIN LATERAL (
    SELECT previous.*
    FROM "waiter_cash_days" AS previous
    WHERE previous."cash_desk" = current_day."cash_desk"
      AND previous."status" = 'CLOSED'
      AND previous."closed_at" <= current_day."opened_at"
    ORDER BY previous."closed_at" DESC, previous."id" DESC
    LIMIT 1
  ) AS previous_day
  WHERE current_day."status" = 'OPEN'
)
UPDATE "waiter_cash_days" AS day
SET
  "expected_opening_cash" = carryover."final_cash_left",
  "opening_difference" = day."counted_opening_cash" - carryover."final_cash_left",
  "carryover_cash_day_id" = carryover."previous_cash_day_id",
  "carryover_declared_by_dotykacka_id" = carryover."closed_by_dotykacka_id",
  "carryover_declared_by_name" = carryover."closed_by_name",
  "carryover_declared_at" = carryover."closed_at",
  "updated_at" = now()
FROM open_carryovers AS carryover
WHERE day."id" = carryover."cash_day_id";
