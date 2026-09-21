ALTER TABLE "reservations"
ALTER COLUMN "guest_name" DROP NOT NULL;

ALTER TABLE "reservations"
ALTER COLUMN "guest_contact" DROP NOT NULL;

ALTER TABLE "reservations"
ALTER COLUMN "party_size" DROP NOT NULL;

ALTER TABLE "reservations"
ALTER COLUMN "location" DROP NOT NULL;
