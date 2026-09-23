import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("module headers keep the shared logo-title-tools-home order", async () => {
  const [header, lighting, styles, standard] = await Promise.all([
    read("app/admin/admin-section-header.tsx"),
    read("app/admin/lighting/lighting-admin-client.tsx"),
    read("app/admin/unified-header.css"),
    read("docs/ADMIN_HEADER_STANDARD.md"),
  ]);

  const logo = header.indexOf("logo-cafe.png");
  const title = header.indexOf("admin-top-title", logo);
  const tools = header.indexOf("admin-top-actions", title);
  const home = header.indexOf("admin-topbar-leading", tools);
  assert.ok(logo >= 0 && logo < title && title < tools && tools < home);
  assert.match(header.slice(home), />Menu główne<\/a>/);
  assert.match(styles, /\.admin-shell \.admin-section-topbar \.admin-top-actions \{[^}]*gap: 12px;/);
  assert.match(styles, /\.admin-shell \.admin-section-topbar \.admin-topbar-leading \{[^}]*margin-left: auto;/);
  assert.match(lighting, /Uprawnienia pracowników/);
  assert.match(lighting, /Podgląd pracownika/);
  assert.match(standard, /logo Marta Banaszek atelier-café/);
  assert.match(standard, /osobny przycisk `Menu główne`/);
});
