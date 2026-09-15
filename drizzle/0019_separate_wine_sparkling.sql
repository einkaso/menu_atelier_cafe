ALTER TABLE "product_content" ADD COLUMN "sparkling_type" text;
--> statement-breakpoint
UPDATE "product_content" AS pc
SET "sparkling_type" = CASE
  WHEN lower(concat_ws(' ', pc."wine_color", pc."wine_style", pc."description_pl", pc."tasting_notes", pc."attributes"::text, p."name", p."features"::text))
    ~ 'naturalnie musuj|pet[- ]?nat|pét[- ]?nat|petillant naturel|pétillant naturel|methode ancestrale|méthode ancestrale|metoda ancestrale'
    THEN 'NATURALLY_SPARKLING'
  ELSE 'SPARKLING'
END
FROM "menu_products" AS p
WHERE p."id" = pc."product_id"
  AND pc."sparkling_type" IS NULL
  AND lower(concat_ws(' ', pc."wine_color", pc."wine_style", pc."description_pl", pc."tasting_notes", pc."attributes"::text, p."name", p."features"::text))
    ~ 'musuj|sparkling|prosecco|cava|frizzante|spumante|sekt|champagne|szampan|pet[- ]?nat|pét[- ]?nat|petillant|pétillant|ancestral';
--> statement-breakpoint
UPDATE "product_content"
SET "wine_color" = NULL
WHERE lower(trim("wine_color")) IN ('musujące', 'musujace', 'sparkling', 'wino musujące', 'wino musujace');
