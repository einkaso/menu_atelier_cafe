import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("runtime media uses managed persistent storage on the production server", async () => {
  const [products, manuals, instructions, thanks] = await Promise.all([
    read("lib/image-import.ts"),
    read("lib/staff-manual-media.ts"),
    read("lib/staff-instruction-attachments.ts"),
    read("lib/employee-thank-you-media.ts"),
  ]);

  for (const source of [products, manuals, instructions, thanks]) assert.match(source, /MENU_UPLOADS_DIRECTORY/);
  assert.match(products, /managedRoot \? `\$\{managedRoot\}\/products`/);
  assert.match(manuals, /managedRoot \? `\$\{managedRoot\}\/staff-manuals`/);
  assert.match(instructions, /managedRoot \? `\$\{managedRoot\}\/staff-instructions`/);
  assert.match(thanks, /managedRoot \? `\$\{managedRoot\}\/employee-thanks`/);
});
