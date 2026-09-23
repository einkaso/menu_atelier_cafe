INSERT INTO "drink_vessels" ("key", "name", "capacity_ml", "icon_path", "active", "sort_order", "updated_at")
VALUES (
  'faja-stemmed-glass-200',
  'Kieliszek FAJA',
  200,
  '/drink-vessels/faja-glass-200ml.webp',
  true,
  70,
  now()
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = excluded."name",
  "capacity_ml" = excluded."capacity_ml",
  "icon_path" = excluded."icon_path",
  "active" = excluded."active",
  "sort_order" = excluded."sort_order",
  "updated_at" = now();
