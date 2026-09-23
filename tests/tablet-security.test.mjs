import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("tablet modals follow Safari visual viewport and keep close controls reachable", async () => {
  const [guard, styles, layout] = await Promise.all([
    read("app/visual-viewport-guard.tsx"),
    read("app/globals.css"),
    read("app/layout.tsx"),
  ]);
  assert.match(guard, /window\.visualViewport/);
  assert.match(guard, /--app-viewport-center-x/);
  assert.match(styles, /\[data-slot="dialog-content"\]/);
  assert.match(styles, /\[data-slot="alert-dialog-content"\]/);
  assert.match(styles, /max-height: calc\(var\(--app-viewport-height\) - 20px\)/);
  assert.match(styles, /transform: none !important/);
  assert.match(styles, /input, select, textarea \{ font-size: 16px !important; \}/);
  assert.match(layout, /<VisualViewportGuard\/>/);
});

test("public kiosk history cannot reveal a protected back-forward snapshot", async () => {
  const [kiosk, protectedGuard, config] = await Promise.all([
    read("app/kiosk-history-guard.tsx"),
    read("app/protected-navigation-guard.tsx"),
    read("next.config.ts"),
  ]);
  assert.match(kiosk, /history\.pushState/);
  assert.match(kiosk, /popstate/);
  assert.match(protectedGuard, /event\.persisted/);
  assert.match(protectedGuard, /pagehide/);
  assert.match(protectedGuard, /api\/waiter\/session/);
  assert.match(protectedGuard, /api\/admin\/session/);
  assert.match(config, /source: "\/admin\/:path\*"/);
  assert.match(config, /source: "\/kelner\/:path\*"/);
});

test("guest handoff clears the server-side employee session before showing guest data", async () => {
  const [waiter, picker, navigation] = await Promise.all([
    read("app/kelner/waiter-client.tsx"),
    read("app/kelner/guest-receipt-picker.tsx"),
    read("app/kelner/staff-navigation.tsx"),
  ]);
  const handoff = waiter.slice(waiter.indexOf("async function handoffToGuest"), waiter.indexOf("const categories", waiter.indexOf("async function handoffToGuest")));
  assert.ok(handoff.indexOf('method: "DELETE"') < handoff.indexOf("setGuestReceipt(receipt)"));
  assert.match(picker, /Nie udało się bezpiecznie wylogować pracownika/);
  assert.match(navigation, /method: "DELETE"/);
  assert.doesNotMatch(waiter, /<Link href="\/">← Menu<\/Link>/);
});
