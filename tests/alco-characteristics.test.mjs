import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, server: { middlewareMode: true } });
after(async () => vite.close());

test("infers useful Alko Bar filters from existing names, descriptions and groups", async () => {
  const { inferredAlcoBarAttributes } = await vite.ssrLoadModule("/lib/alco-characteristics.ts");

  assert.deepEqual(
    inferredAlcoBarAttributes("Sarti Spritz", "Sarti Rosa · prosecco · pomarańcza", "Spritze"),
    {
      cocktailType: "Spritz",
      cocktailBase: "Prosecco · Aperitif / bitter",
      servingStyle: "Kieliszek do wina",
    },
  );
  assert.deepEqual(
    inferredAlcoBarAttributes("Wódka premium", "czysta wódka", "Wódka na butelki"),
    { cocktailType: "Alkohol na butelkę", cocktailBase: "Wódka", servingStyle: "Butelka" },
  );
});
