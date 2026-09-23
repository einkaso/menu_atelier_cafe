INSERT INTO "drink_vessels" ("key", "name", "capacity_ml", "icon_path", "source_url", "active", "sort_order", "updated_at")
VALUES (
  'luminarc-new-morning-320',
  'Kubek szklany Luminarc New Morning',
  320,
  '/drink-vessels/luminarc-new-morning-320ml.webp',
  'https://www.gastropuls.pl/img/imagecache/89001-90000/680x680/1/product-media/89001-90000/Kubek-szklany-hartowany-New-Morning-320ml-Luminarc-P0211-153898-680x680.webp',
  true,
  60,
  now()
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = excluded."name",
  "capacity_ml" = excluded."capacity_ml",
  "icon_path" = excluded."icon_path",
  "source_url" = excluded."source_url",
  "active" = excluded."active",
  "sort_order" = excluded."sort_order",
  "updated_at" = now();
