import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("home page separates the company Christmas offer from the upcoming cake catalogue", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/menu-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /ŚWIĘTA 2026 · DLA FIRM I GOŚCI KAWIARNI/);
  assert.match(source, /Specjalna oferta świąteczna/);
  assert.match(source, /Zestawy prezentowe i ciasta na zamówienie/);
  assert.match(source, /Już teraz przyjmujemy zapytania i zamówienia na świąteczne zestawy dla firm/);
  assert.match(source, /Oferta ciast świątecznych dla gości kawiarni, z możliwością odbioru w Wigilię lub dzień wcześniej/);
  assert.match(source, /Upominki dla zespołu, klientów i partnerów biznesowych możesz też odebrać w naszej kawiarni/);
  assert.match(source, /Zamów i odbierz, gdzie Tobie wygodniej/);
  assert.match(source, /W tym miejscu już niebawem przedstawimy ofertę specjalnych ciast przygotowanych przez cukierników na tegoroczne Święta/);
  assert.doesNotMatch(source, /DWIE ODRĘBNE OFERTY/);
  assert.match(source, /Ciasta na Wigilię/);
  assert.match(source, /Już wkrótce!/);
  assert.match(source, /className="christmas-side-offers"/);
  assert.match(source, /Zorganizuj u nas świąteczno-noworoczne spotkanie/);
  assert.match(source, /data-future-destination="christmas-events"/);
  assert.match(source, /Nowa zakładka eventowa w przygotowaniu/);
  assert.match(source, /active==="christmas"/);
  assert.match(source, /style=\{\{backgroundColor:current\.background\}\}/);
  assert.match(css, /\.christmas-business-visual\{[^}]*aspect-ratio:1828\/1846/);
  assert.match(css, /\.christmas-business-visual img\{[^}]*width:100%;height:100%;object-fit:contain/);
  assert.match(css, /\.christmas-cakes\{[^}]*background:#49933e/);
  assert.match(css, /\.christmas-side-offers\{[^}]*grid-template-rows:minmax\(0,1fr\) minmax\(0,2fr\)/);
  assert.match(css, /\.christmas-events-banner\{[^}]*background:linear-gradient/);
  for (const file of ["01-cover.png", "02-business-offer.png", "03-pralines.png", "04-gift-sets-intro.png", "05-gift-sets.png", "06-contact.png"]) {
    await access(new URL(`../public/christmas/${file}`, import.meta.url));
  }
});
