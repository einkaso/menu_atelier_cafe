import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses the full viewport width for the worker inventory screen", async () => {
  const styles = await read("app/kelner/inventory/inventory-worker-enhancements.css");
  assert.match(styles, /\.inventory-worker-layout \{[\s\S]*width: 100%;[\s\S]*margin: 0;[\s\S]*padding: 14px clamp\(14px, 2\.2vw, 32px\) 70px;/);
  assert.match(styles, /\.inventory-worker > \.waiter-section-header \{[\s\S]*width: 100%;[\s\S]*margin: 0;/);
});
