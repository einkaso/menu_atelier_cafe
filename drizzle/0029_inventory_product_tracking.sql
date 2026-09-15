ALTER TABLE "inventory_catalog_products" ADD COLUMN "inventory_tracked" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "inventory_catalog_products" AS product
SET "inventory_tracked" = true
WHERE lower(coalesce(product."unit", '')) IN ('kilogram', 'kg')
  AND product."stock_quantity" >= 0
  AND EXISTS (
    SELECT 1
    FROM "inventory_stage_items" AS item
    INNER JOIN "inventory_stages" AS stage ON stage."id" = item."stage_id"
    WHERE item."product_dotykacka_id" = product."dotykacka_id"
      AND stage."status" IN ('ASSIGNED', 'IN_PROGRESS')
      AND item."count_status" = 'PENDING'
      AND NOT EXISTS (
        SELECT 1 FROM "inventory_stage_items" AS counted
        WHERE counted."stage_id" = stage."id" AND counted."count_status" <> 'PENDING'
      )
  );
--> statement-breakpoint
DELETE FROM "inventory_stage_items" AS item
USING "inventory_stages" AS stage, "inventory_catalog_products" AS product
WHERE item."stage_id" = stage."id"
  AND item."product_dotykacka_id" = product."dotykacka_id"
  AND stage."status" IN ('ASSIGNED', 'IN_PROGRESS')
  AND item."count_status" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "inventory_stage_items" AS counted
    WHERE counted."stage_id" = stage."id" AND counted."count_status" <> 'PENDING'
  )
  AND product."inventory_tracked" = false;
