ALTER TABLE "product_content"
DROP CONSTRAINT IF EXISTS "product_content_espresso_shots_check";

ALTER TABLE "product_content"
ADD CONSTRAINT "product_content_espresso_shots_check"
CHECK ("espresso_shots" is null or "espresso_shots" in (0, 1, 2));
