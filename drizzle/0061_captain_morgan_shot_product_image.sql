UPDATE "product_content"
SET
  "image_path" = '/api/product-images/901105-0de88dddb8d6bb9a.png',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '1242835061521895'
  LIMIT 1
);
