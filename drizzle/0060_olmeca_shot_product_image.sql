UPDATE "product_content"
SET
  "image_path" = '/api/product-images/901101-fc51177ac11429af.png',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '1163500769319863'
  LIMIT 1
);
