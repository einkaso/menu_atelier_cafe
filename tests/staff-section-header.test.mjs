import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("orders every staff section header as logo, title and right-edge controls", async () => {
  const [component, styles] = await Promise.all([
    read("app/kelner/staff-navigation.tsx"),
    read("app/kelner/unified-header.css"),
  ]);
  const header = component.slice(component.indexOf("return <header"), component.indexOf("</header>") + 9);
  assert.ok(header.indexOf("logo-cafe.png") < header.indexOf("waiter-section-title"));
  assert.ok(header.indexOf("waiter-section-title") < header.indexOf("waiter-section-controls"));
  assert.match(header, /waiter-section-controls[\s\S]*← Menu[\s\S]*Wyloguj/);
  assert.match(styles, /\.waiter-section-header \.waiter-section-controls \{[\s\S]*margin: 0 0 0 auto !important;/);
});

test("uses the larger café logo on the workforce page", async () => {
  const [layout, styles] = await Promise.all([
    read("app/kelner/layout.tsx"),
    read("app/kelner/grafik/workforce-header.css"),
  ]);
  assert.match(layout, /import "\.\/grafik\/workforce-header\.css"/);
  assert.match(styles, /\.workforce-employee > header\.waiter-section-header > img \{[\s\S]*width: 176px !important;/);
});
