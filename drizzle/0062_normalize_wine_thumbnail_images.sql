UPDATE "product_content" AS pc
SET
  "image_path" = mapped.image_path,
  "updated_at" = now()
FROM (
  VALUES
    ('1161577021855155', '/api/product-images/109-032db62953dc1aa3.webp'),
    ('1232888902406771', '/api/product-images/116-70611b8460686786.webp'),
    ('1232891726132895', '/api/product-images/123-b46a7d58f3bc1568.webp'),
    ('2301314891134215', '/api/product-images/2187461-5eb6eac73eb3a4cd.webp'),
    ('2279946920195279', '/api/product-images/404-a60ea0a7e9564c3a.webp'),
    ('2283277910504359', '/api/product-images/412-5dad24d675e544b5.webp'),
    ('2279947645426835', '/api/product-images/414-abaab376574a5dde.webp'),
    ('2283277652774139', '/api/product-images/427-59acd37ba76bedef.webp'),
    ('2283277494028975', '/api/product-images/608577-3af31b34046f1255.webp'),
    ('2283277298686039', '/api/product-images/611469-14e3add3f42e1500.webp'),
    ('1511758512586171', '/api/product-images/615613-7a1439ab9ebf59b0.webp'),
    ('1436393381986111', '/api/product-images/79-49fc5c737ba9f951.webp'),
    ('1511697061831599', '/api/product-images/9277-1e514ef9579fd97c.webp'),
    ('1331839498695807', '/api/product-images/94-105cb033e2f645bf.webp'),
    ('1368857729559711', '/api/product-images/96-3a82124fee93ff7f.webp'),
    ('1453566410875831', '/api/product-images/98-dedefffe353119ee.webp')
) AS mapped(dotykacka_id, image_path)
JOIN "menu_products" AS product
  ON product."dotykacka_id" = mapped.dotykacka_id
WHERE pc."product_id" = product."id";
