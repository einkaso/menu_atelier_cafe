import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses the agreed daily takings heading", async () => {
  const source = await readFile(new URL("../app/kelner/settlement-form.tsx", import.meta.url), "utf8");
  assert.match(source, /Codzienny system rozliczania utargu\./);
  assert.doesNotMatch(source, /Co robisz\?/);
});
