ALTER TABLE "inventory_catalog_products"
ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
