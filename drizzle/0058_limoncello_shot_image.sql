UPDATE "product_content"
SET
  "image_path" = '/api/product-images/901088-9a1764fa9b5fed12.webp',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '1659034450653007'
  LIMIT 1
);
