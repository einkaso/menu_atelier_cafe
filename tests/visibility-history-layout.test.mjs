import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("visibility history keeps both actions inside its workspace", async () => {
  const css = await readFile(new URL("../app/admin/admin.css", import.meta.url), "utf8");

  assert.match(css, /\.admin-visibility-workspace\{width:min\(1500px,95vw\)\}/);
  assert.match(css, /\.admin-visibility-list>article\{[^}]*min-width:0;[^}]*minmax\(380px,1\.25fr\)/);
  assert.match(css, /\.admin-visibility-list \.admin-secondary\{[^}]*min-width:0;[^}]*flex:1 1 0/);
  assert.match(css, /@media\(max-width:1180px\)\{\.admin-visibility-list>article\{grid-template-columns:90px minmax\(180px,1fr\) minmax\(180px,1fr\)\}/);
});
