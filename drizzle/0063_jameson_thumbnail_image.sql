UPDATE "product_content"
SET
  "image_path" = '/api/product-images/36753-e1a66dd61fd8bd7f.webp',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '2037163777390383'
  LIMIT 1
);
