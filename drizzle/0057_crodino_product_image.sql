UPDATE "product_content"
SET
  "image_path" = '/api/product-images/601572-cee5801e25ee8f32.webp',
  "updated_at" = now()
WHERE "product_id" = (
  SELECT "id"
  FROM "menu_products"
  WHERE "dotykacka_id" = '2248840919868519'
  LIMIT 1
);
