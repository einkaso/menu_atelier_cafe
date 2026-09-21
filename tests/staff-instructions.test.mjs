import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("stores versioned staff instructions and per-employee acknowledgements", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0037_staff_instructions.sql")]);
  for (const source of [schema, migration]) {
    assert.match(source, /staff_instructions/);
    assert.match(source, /staff_instruction_receipts/);
    assert.match(source, /instruction_revision/);
    assert.match(source, /employee_dotykacka_id/);
    assert.match(source, /deferred_until/);
    assert.match(source, /acknowledged_at/);
    assert.match(source, /staff_instruction_receipts_instruction_employee_revision_uq/);
  }
});

test("publishes, republishes and archives instructions from the admin catalogue", async () => {
  const [route, client, panel] = await Promise.all([
    read("app/api/admin/instructions/route.ts"),
    read("app/admin/instructions/instructions-admin-client.tsx"),
    read("app/admin/admin-panel.tsx"),
  ]);
  assert.match(route, /action === "PUBLISH"/);
  assert.match(route, /action === "REPUBLISH"/);
  assert.match(route, /revision: instruction\.revision \+ 1/);
  assert.match(route, /action === "ARCHIVE"/);
  assert.match(client, /Wyślij do pracowników/);
  assert.match(client, /Stan zapoznania pracowników/);
  assert.match(panel, /href="\/admin\/instructions">Instrukcje/);
});

test("reminds workers, permits one two-hour deferral and requires a read declaration", async () => {
  const [route, reminder, catalogue, layout, navigation] = await Promise.all([
    read("app/api/waiter/instructions/route.ts"),
    read("app/kelner/instruction-reminder.tsx"),
    read("app/kelner/instrukcje/instruction-catalog-client.tsx"),
    read("app/kelner/layout.tsx"),
    read("app/kelner/staff-navigation.tsx"),
  ]);
  assert.match(route, /DEFER_MILLISECONDS = 2 \* 60 \* 60 \* 1000/);
  assert.match(route, /if \(receipt\?\.deferredAt\)/);
  assert.match(route, /body\.declaration !== "I_HAVE_READ"/);
  assert.match(route, /instruction\.status === "PUBLISHED" && !acknowledged && !deferred/);
  assert.match(reminder, /Zostaw na później · 2 godziny/);
  assert.match(reminder, /window\.setInterval\(\(\) => void load\(\), 60_000\)/);
  assert.match(catalogue, /Oświadczam, że zapoznałem\/am się z treścią instrukcji/);
  assert.match(catalogue, /scrollTop \+ node\.clientHeight >= node\.scrollHeight - 24/);
  assert.match(catalogue, /staff-instructions-changed/);
  assert.match(reminder, /staff-instructions-changed/);
  assert.match(layout, /WaiterStaffDock/);
  assert.match(navigation, /WaiterInstructionEntry/);
});

test("new workers inherit every published instruction while archived material is not mandatory", async () => {
  const route = await read("app/api/waiter/instructions/route.ts");
  assert.match(route, /inArray\(staffInstructions\.status, \["PUBLISHED", "ARCHIVED"\]\)/);
  assert.match(route, /pendingCount: result\.filter\(\(instruction\) => instruction\.status === "PUBLISHED"/);
  assert.match(route, /canDefer: instruction\.status === "PUBLISHED"/);
});

test("instructions accept protected image and PDF attachments", async () => {
  const [schema, migration, helper, adminRoute, fileRoute, adminClient, waiterRoute, waiterClient, storage] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0040_staff_instruction_attachments.sql"),
    read("lib/staff-instruction-attachments.ts"),
    read("app/api/admin/instructions/[id]/attachments/route.ts"),
    read("app/api/staff-instruction-files/[filename]/route.ts"),
    read("app/admin/instructions/instructions-admin-client.tsx"),
    read("app/api/waiter/instructions/route.ts"),
    read("app/kelner/instrukcje/instruction-catalog-client.tsx"),
    read("ops/prepare-persistent-storage.sh"),
  ]);
  assert.match(schema, /attachments: jsonb\("attachments"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "attachments" jsonb/);
  assert.match(helper, /MAX_FILE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(helper, /isPdf\(source\)/);
  assert.match(helper, /detectUploadedImageType\(source\)/);
  assert.match(adminRoute, /MAX_ATTACHMENTS = 10/);
  assert.match(adminRoute, /revision: revision \+ 1/);
  assert.match(fileRoute, /await isAdmin\(\)/);
  assert.match(fileRoute, /await currentWaiter\(request\)/);
  assert.match(adminClient, /Dodaj zdjęcia lub PDF/);
  assert.match(waiterRoute, /attachments: instruction\.attachments/);
  assert.match(waiterClient, /waiter-instruction-attachments/);
  assert.match(storage, /uploads\/staff-instructions/);
});
