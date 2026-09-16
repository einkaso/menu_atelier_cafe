ALTER TABLE "inventory_catalog_products" ADD COLUMN "inventory_counting_mode" text DEFAULT 'QUANTITY' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_catalog_products" ADD COLUMN "servings_per_container" integer;
--> statement-breakpoint
ALTER TABLE "inventory_stage_items" ADD COLUMN "counting_mode" text DEFAULT 'QUANTITY' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_stage_items" ADD COLUMN "servings_per_container" integer;
--> statement-breakpoint
ALTER TABLE "inventory_count_entries" ADD COLUMN "whole_containers" integer;
--> statement-breakpoint
ALTER TABLE "inventory_count_entries" ADD COLUMN "loose_servings" integer;
--> statement-breakpoint
UPDATE "inventory_catalog_products" AS product
SET "inventory_counting_mode" = 'WINE_BOTTLE',
    "inventory_tracked" = true,
    "servings_per_container" = CASE
      WHEN lower(product."name") ~ '(prosecco|cava|frizzante|spumante|sekt|champagne|szamp|pet[ -]?nat|moscato d.ast)' THEN 6
      ELSE 5
    END
FROM "inventory_catalog_categories" AS category
WHERE category."dotykacka_id" = product."category_dotykacka_id"
  AND upper(trim(category."name")) = 'WINA'
  AND product."deleted" = false
  AND lower(product."name") !~ '(kieliszek|glass)';
--> statement-breakpoint
UPDATE "inventory_catalog_products"
SET "inventory_counting_mode" = 'BOTTLE_ONLY',
    "inventory_tracked" = true,
    "servings_per_container" = NULL
WHERE "wine_code" IN ('WIN14', 'WIN64', 'WIN65');
--> statement-breakpoint
UPDATE "inventory_catalog_products" AS product
SET "inventory_tracked" = false
FROM "inventory_catalog_categories" AS category
WHERE category."dotykacka_id" = product."category_dotykacka_id"
  AND upper(trim(category."name")) = 'WINA'
  AND lower(product."name") ~ '(kieliszek|glass)';
