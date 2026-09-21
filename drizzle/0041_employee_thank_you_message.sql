ALTER TABLE "waiter_employees"
ADD COLUMN IF NOT EXISTS "thank_you_message" text DEFAULT 'Dziękuję i zapraszam ponownie!' NOT NULL;
