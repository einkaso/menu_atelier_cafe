INSERT INTO "drink_vessels" ("key", "name", "capacity_ml", "icon_path", "source_url", "active", "sort_order", "updated_at")
VALUES
  ('elysia-whisky-350', 'Szklanka do whisky Elysia', 350, '/drink-vessels/elysia-whisky-350.webp', 'https://b.assecobs.com/_img/dajarhoreca/c6f602fd-c246-479b-8d88-8250452107a1/elysia-szklanka-do-whisky-poj-355-ml-sr-84-mm-wys-98-mm-camrack-285845.jpg', true, 100, now()),
  ('elysia-highball-360', 'Szklanka wysoka Elysia', 360, '/drink-vessels/elysia-highball-360.webp', 'https://b.assecobs.com/_img/dajarhoreca/7c7cab2b-a743-4e26-90d8-fd24696a60a6/elysia-szklanka-wysoka-poj-365-ml-ps-520445.jpg', true, 110, now()),
  ('elysia-highball-280', 'Szklanka wysoka Elysia 280 ml', 280, '/drink-vessels/elysia-highball-280.webp', 'https://b.assecobs.com/_img/dajarhoreca/ab51d7ce-8ecc-4ef2-ba21-95c97ea5d683/elysia-szklanka-wysoka-poj-280-ml-sr-66-mm-wys-140-mm-ps-520125.jpg', true, 120, now()),
  ('elysia-carafe-1000', 'Karafka Elysia 1 l', 1000, '/drink-vessels/elysia-carafe-1000.webp', 'https://b.assecobs.com/_img/dajarhoreca/2148d092-2107-444c-b124-8915409ed8c1/elysia-karafka-poj-940-ml-ps-80403.jpg?w=1300&org_if_sml=0', true, 130, now()),
  ('elysia-cocktail-500', 'Kieliszek koktajlowy Elysia', 500, '/drink-vessels/elysia-cocktail-500.webp', 'https://b.assecobs.com/_img/dajarhoreca/7aa8ec6c-3f86-4853-9db0-cf646cb3bfb0/elysia-elysia-kieliszek-koktailowy-poj-500-ml-sr-101-mm-wys-198-mm-.jpg?w=1300&org_if_sml=0', true, 140, now()),
  ('elysia-champagne-coupe-260', 'Kieliszek koktajlowy do szampana Elysia', 260, '/drink-vessels/elysia-champagne-coupe-260.webp', 'https://b.assecobs.com/_img/dajarhoreca/469535fb-4d29-4a26-b3e4-5c084d44ec9c/elysia-kieliszek-koktajlowy-do-szampana-poj-260-ml-sr-101-mm-wys-164-mm-.jpg?w=1300&org_if_sml=0', true, 150, now())
ON CONFLICT ("key") DO UPDATE SET
  "name" = excluded."name",
  "capacity_ml" = excluded."capacity_ml",
  "icon_path" = excluded."icon_path",
  "source_url" = excluded."source_url",
  "active" = excluded."active",
  "sort_order" = excluded."sort_order",
  "updated_at" = now();
