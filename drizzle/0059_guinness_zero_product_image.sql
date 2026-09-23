UPDATE "product_content"
SET
  "image_path" = '/api/product-images/261-195b332ba07a054d.png',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '1744044472238067'
  LIMIT 1
);
