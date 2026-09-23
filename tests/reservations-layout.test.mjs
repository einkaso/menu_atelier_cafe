import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses an edge-to-edge reservations header with a larger logo", async () => {
  const [layout, styles] = await Promise.all([
    read("app/kelner/layout.tsx"),
    read("app/kelner/rezerwacje/reservations-full-width.css"),
  ]);
  assert.match(layout, /import "\.\/rezerwacje\/reservations-full-width\.css"/);
  assert.match(styles, /\.waiter-reservations \{[\s\S]*padding: 0 0 76px !important;/);
  assert.match(styles, /> header\.waiter-section-header \{[\s\S]*width: 100%;[\s\S]*margin: 0 !important;/);
  assert.match(styles, /> header\.waiter-section-header > img \{[\s\S]*width: 176px !important;/);
  assert.match(styles, /\.waiter-reservation-hero \{[\s\S]*margin: 17px var\(--waiter-reservations-gutter\) !important;/);
});
