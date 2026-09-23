INSERT INTO "drink_vessels" ("key", "name", "capacity_ml", "icon_path", "source_url", "active", "sort_order", "updated_at")
VALUES
	('churchill-monochrome-espresso-100', 'Filiżanka espresso Churchill Monochrome', 100, '/drink-vessels/churchill-espresso-100ml.png', 'https://sklep.technica.pl/rest/rest_products/image/501/101001-102000/churchill_moblceb91.webp', true, 10, now()),
	('churchill-monochrome-cup-220', 'Filiżanka Churchill Monochrome', 220, '/drink-vessels/churchill-cup-220ml.png', 'https://sklep.technica.pl/rest/rest_products/image/501/101001-102000/churchill_moblcb281(1).webp', true, 20, now()),
	('churchill-monochrome-mug-340', 'Kubek Churchill Monochrome', 340, '/drink-vessels/churchill-mug-340ml.png', 'https://sklep.technica.pl/rest/rest_products/image/501/101001-102000/churchill_moblvm121.webp', true, 30, now()),
	('churchill-monochrome-cup-340', 'Filiżanka Churchill Monochrome', 340, '/drink-vessels/churchill-cup-340ml.png', 'https://sklep.technica.pl/rest/rest_products/image/501/101001-102000/churchill_moblcb281.webp', true, 40, now()),
	('churchill-monochrome-teapot-400', 'Dzbanek Churchill Monochrome', 400, '/drink-vessels/churchill-teapot-400ml.png', 'https://sklep.technica.pl/rest/rest_products/image/501/101001-102000/churchill_moblsb151.webp', true, 50, now())
ON CONFLICT ("key") DO UPDATE SET
	"name" = excluded."name",
	"capacity_ml" = excluded."capacity_ml",
	"icon_path" = excluded."icon_path",
	"source_url" = excluded."source_url",
	"active" = excluded."active",
	"sort_order" = excluded."sort_order",
	"updated_at" = now();
