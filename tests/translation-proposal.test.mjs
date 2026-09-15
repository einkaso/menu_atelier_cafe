import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  plugins: [{
    name: "server-only-test-shim",
    resolveId(id) { return id === "server-only" ? "\0server-only" : null; },
    load(id) { return id === "\0server-only" ? "export {};" : null; },
  }],
  server: { middlewareMode: true },
});
after(async () => vite.close());

test("recognizes English proposal text but leaves Polish text alone", async () => {
  const { proposalNeedsPolishTranslation } = await vite.ssrLoadModule("/lib/translation.ts");
  assert.equal(proposalNeedsPolishTranslation({
    descriptionPl: "A full-bodied red wine with aromas of cherry and oak.",
    tastingNotes: "Fresh fruit and a long finish.",
  }), true);
  assert.equal(proposalNeedsPolishTranslation({
    descriptionPl: "Pełne czerwone wino o aromacie wiśni i delikatnej nucie dębu.",
    tastingNotes: "Świeże owoce i długi finisz.",
  }), false);
});

test("translates English descriptive proposal fields to Polish before approval", async () => {
  const { translateProductProposalToPolish } = await vite.ssrLoadModule("/lib/translation.ts");
  const previousKey = process.env.DEEPL_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPL_API_KEY = "test-key:fx";
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      translations: requestBody.text.map((text) => ({ text: `PL: ${text}`, detected_source_language: "EN" })),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const proposal = await translateProductProposalToPolish({
      descriptionPl: "A full-bodied red wine with aromas of cherry.",
      country: "Włochy",
      region: "Tuscany",
      grapes: "Sangiovese",
      wineStyle: "Full-bodied",
      tastingNotes: "Cherry, plum and a long finish.",
      imageSourceUrl: "https://example.com/wine.jpg",
      attributes: { alcoholPercentage: "13%", origin: "Italy" },
    });

    assert.equal(requestBody.target_lang, "PL");
    assert.equal("source_lang" in requestBody, false);
    assert.equal(proposal.descriptionPl, "PL: A full-bodied red wine with aromas of cherry.");
    assert.equal(proposal.region, "PL: Tuscany");
    assert.equal(proposal.wineStyle, "PL: Full-bodied");
    assert.equal(proposal.tastingNotes, "PL: Cherry, plum and a long finish.");
    assert.equal(proposal.attributes.origin, "PL: Italy");
    assert.equal(proposal.grapes, "Sangiovese");
    assert.equal(proposal.attributes.alcoholPercentage, "13%");
    assert.equal(proposal.imageSourceUrl, "https://example.com/wine.jpg");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPL_API_KEY;
    else process.env.DEEPL_API_KEY = previousKey;
  }
});

test("stores and reads separate English values for product detail attributes", async () => {
  const { productAttributesEn, productAttributesNeedTranslation, productAttributesPl, translateProductAttributes } = await vite.ssrLoadModule("/lib/translation.ts");
  const previousKey = process.env.DEEPL_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPL_API_KEY = "test-key:fx";
  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ translations: requestBody.text.map((text) => ({ text: `EN: ${text}` })) }), { status: 200 });
  };

  try {
    const source = { dietaryInfo: "Bez siarczanów", producer: "Tłocznia Karkonoska" };
    assert.equal(productAttributesNeedTranslation(source, source), true);
    const stored = await translateProductAttributes(source);
    assert.deepEqual(productAttributesPl(stored), source);
    assert.deepEqual(productAttributesEn(stored), { dietaryInfo: "EN: Bez siarczanów", producer: "EN: Tłocznia Karkonoska" });
    assert.equal(productAttributesNeedTranslation(source, stored), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPL_API_KEY;
    else process.env.DEEPL_API_KEY = previousKey;
  }
});
