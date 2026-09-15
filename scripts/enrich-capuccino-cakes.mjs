import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import postgres from "postgres";
import sharp from "sharp";

const CAPUCCINO_SUPPLIER_ID = "1191377892154067";
const applyChanges = process.argv.includes("--apply");
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "products");

const products = [
  {
    id: 1424,
    expectedName: "Beza z rokitnikiem - całe ciasto",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-z-rokitnikiem/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/16_4H1A2565.jpg",
    descriptionPl: "Kruchy tort bezowy przełożony kremem z mascarpone i śmietany oraz rokitnikiem. Cytrusowa kwasowość owocu równoważy słodycz bezy, tworząc świeży, lekko egzotyczny smak.",
    descriptionEn: "A crisp meringue cake layered with mascarpone cream and sea buckthorn. The fruit’s citrus-like acidity balances the sweetness of the meringue for a fresh, subtly exotic finish.",
  },
  {
    id: 1450,
    expectedName: "SERNIK Pomarańczowy _CAP",
    sourcePage: "https://capuccinocafe.pl/produkt/sernik-pomaranczowy/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/128_4H1A2999.jpg",
    descriptionPl: "Klasyczna masa serowa zyskuje lekkość i świeży aromat dzięki pomarańczy. Całość wieńczy ciemna polewa czekoladowa, która przyjemnie kontrastuje z cytrusową nutą.",
    descriptionEn: "A classic cheesecake brightened with fresh orange flavour. A dark chocolate glaze provides an elegant contrast to its light citrus note.",
  },
  {
    id: 1440,
    expectedName: "Sernik baskijski",
    sourcePage: "https://capuccinocafe.pl/produkt/sernik-baskijski/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2023/02/122_4H1A2984.jpg",
    descriptionPl: "Aksamitny sernik na bazie mascarpone i serka śmietankowego, wypieczony w baskijskim stylu. Jego złocisty, mocniej skarmelizowany wierzch kryje wyjątkowo kremowe wnętrze.",
    descriptionEn: "A silky Basque-style cheesecake made with mascarpone and cream cheese. Its deeply caramelised golden top gives way to an exceptionally creamy centre.",
  },
  {
    id: 1454,
    expectedName: "Sernik z malinami",
    sourcePage: "https://capuccinocafe.pl/produkt/sernik-malinowy/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/11/123_4H1A3068.jpg",
    descriptionPl: "Kremowa masa z twarogu i mascarpone spotyka się z intensywną świeżością malin. Owocowa kwasowość przełamuje delikatną słodycz, pozostawiając lekki i harmonijny smak.",
    descriptionEn: "Creamy curd cheese and mascarpone meet the vivid freshness of raspberries. Their fruity acidity cuts through the gentle sweetness for a light, balanced finish.",
  },
  {
    id: 1455,
    expectedName: "Szarlotka",
    sourcePage: "https://capuccinocafe.pl/produkt/szarlotka/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/119_4H1A2979.jpg",
    descriptionPl: "Maślane kruche ciasto wypełnione soczystymi, długo duszonymi jabłkami z cynamonem. Chrupiący spód i miękkie nadzienie tworzą klasyczny, domowy deser o korzennym aromacie.",
    descriptionEn: "Buttery shortcrust pastry filled with juicy, slow-cooked apples and cinnamon. A crisp base and soft filling make this a warmly spiced, timeless classic.",
  },
  {
    id: 1473,
    expectedName: "TORT BEZOWY PISTACJOWY_CAP",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-z-pistacjami/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/11/7_4H1A2530.jpg",
    descriptionPl: "Chrupiące blaty bezowe przełożone są kremem z mascarpone, śmietany i czystej pasty pistacjowej. Maliny dodają kompozycji świeżej kwasowości, która równoważy słodycz bezy i orzechową głębię kremu.",
    descriptionEn: "Crisp meringue layers are filled with mascarpone cream and pure pistachio paste. Raspberries add a bright acidity that balances the sweetness and deep nutty flavour.",
  },
  {
    id: 1472,
    expectedName: "TORT Bezowy_ czekoladowo- wiśniowy",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-z-czekolada-i-wisniami/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/31_4H1A2614.jpg",
    descriptionPl: "Chrupiące blaty bezowe, aksamitny krem i soczyste wiśnie tworzą deser pełen kontrastów. Owocowa kwasowość przełamuje czekoladową głębię i delikatną słodycz bezy.",
    descriptionEn: "Crisp meringue, silky cream and juicy cherries create a dessert rich in contrasts. The fruit’s acidity cuts through the chocolate depth and delicate sweetness.",
  },
  {
    id: 1483,
    expectedName: "TORT FERRERO ROCHER _CAP",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-ferrero-roche/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/11/70_4H1A2793-scaled.jpg",
    descriptionPl: "Intensywnie czekoladowo-orzechowy tort inspirowany smakiem pralinek Ferrero. Kremy z mascarpone i śmietany, mleczna oraz karmelowa czekolada i chrupiąca prażynka tworzą bogatą, wielowarstwową kompozycję.",
    descriptionEn: "An intensely chocolate-and-hazelnut cake inspired by Ferrero pralines. Mascarpone cream, milk and caramel chocolate, and a crisp praline layer create a rich, multi-layered dessert.",
  },
  {
    id: 1457,
    expectedName: "Tarta cytrynowa z bezą włoską",
    sourcePage: "https://capuccinocafe.pl/produkt/tarta-cytrynowa/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/87_4H1A2867.jpg",
    descriptionPl: "Krucha, maślana tarta z wyrazistym cytrynowym nadzieniem i lekką bezą włoską. Słodycz kremu i bezy równoważy świeża kwasowość cytryny.",
    descriptionEn: "A buttery tart with vibrant lemon filling and light Italian meringue. The sweetness of the cream and meringue is balanced by fresh citrus acidity.",
  },
  {
    id: 1487,
    expectedName: "Tort Red Velvet",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-red-velvet/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/020Torty-11-2025-scaled.jpg",
    descriptionPl: "Rubinowe blaty na maślance są puszyste, wilgotne i lekkie. Delikatny krem na serku Philadelphia i maśle wnosi subtelną słoną nutę, która elegancko przełamuje słodycz ciasta.",
    descriptionEn: "Ruby-red buttermilk layers are fluffy, moist and light. A delicate cream cheese and butter frosting adds a subtle savoury note that elegantly offsets the sweetness.",
  },
  {
    id: 1474,
    expectedName: "Tort bezowy z czarną porzeczką",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-z-czarna-porzeczka/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/22_4H1A2583.jpg",
    descriptionPl: "Chrupiąca beza z kremem mascarpone, białą czekoladą i czarną porzeczką. Wyrazista owocowa kwasowość nadaje deserowi świeżości i równoważy jego kremową słodycz.",
    descriptionEn: "Crisp meringue with mascarpone cream, white chocolate and blackcurrant. The fruit’s vivid acidity brings freshness and balances the creamy sweetness.",
  },
  {
    id: 1476,
    expectedName: "Tort bezowy z malinami",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-z-malinami/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/13_4H1A2558.jpg",
    descriptionPl: "Chrupiąca beza, lekki krem śmietankowy i świeże maliny tworzą klasyczne połączenie Capuccino Cafe. Owocowa kwasowość nadaje mu świeżości i przyjemnie równoważy słodycz.",
    descriptionEn: "Crisp meringue, light cream and fresh raspberries form a Capuccino Cafe classic. Bright berry acidity adds freshness and neatly balances the sweetness.",
  },
  {
    id: 1489,
    expectedName: "Tort tiramisu",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-tiramisu/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/08/41_4H1A2695-scaled.jpg",
    descriptionPl: "Biszkopty savoiardi nasączone espresso i amaretto przełożone są jedwabistym kremem mascarpone. Głębokie kakao dopełnia harmonijny, kawowo-migdałowy smak bez nadmiernej słodyczy.",
    descriptionEn: "Savoiardi soaked in espresso and amaretto are layered with silky mascarpone cream. Deep cocoa completes its balanced coffee-and-almond flavour without excessive sweetness.",
  },
  {
    id: 1491,
    expectedName: "Tort truskawkowy",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-truskawkowy/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/023Torty-11-2025-scaled.jpg",
    descriptionPl: "Krem z mascarpone i śmietany łączy się z truskawkowym puree, białą oraz truskawkową czekoladą. Liofilizowane owoce wzmacniają świeży smak, a chrupiąca prażynka dodaje wyraźnego kontrastu tekstur.",
    descriptionEn: "Mascarpone cream meets strawberry purée with white and strawberry chocolate. Freeze-dried fruit intensifies the fresh flavour, while a crisp praline layer adds textural contrast.",
  },
  {
    id: 1492,
    expectedName: "Tort truskawkowy_CAP",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-truskawkowy/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/023Torty-11-2025-scaled.jpg",
    descriptionPl: "Krem z mascarpone i śmietany łączy się z truskawkowym puree, białą oraz truskawkową czekoladą. Liofilizowane owoce wzmacniają świeży smak, a chrupiąca prażynka dodaje wyraźnego kontrastu tekstur.",
    descriptionEn: "Mascarpone cream meets strawberry purée with white and strawberry chocolate. Freeze-dried fruit intensifies the fresh flavour, while a crisp praline layer adds textural contrast.",
  },
  {
    id: 1439,
    expectedName: "sernik  PASHA_CAP",
    sourcePage: "https://capuccinocafe.pl/produkt/pascha/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2022/05/117_4H1A3045.jpg",
    descriptionPl: "Tradycyjna pascha na bazie kremowego twarogu, masła i mleka, słodzona miodem. Gorzka czekolada, orzechy i kandyzowana skórka pomarańczowa dodają jej głębi, chrupkości i świeżego aromatu.",
    descriptionEn: "Traditional pasha made with creamy curd cheese, butter and milk, gently sweetened with honey. Dark chocolate, nuts and candied orange peel add depth, crunch and fragrant freshness.",
  },
  {
    id: 1477,
    expectedName: "Tort bezowy z mango",
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-mango/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/19_4H1A2575.jpg",
    descriptionPl: "Kruche blaty bezowe przełożone są lekkim kremem śmietankowym i soczystym mango. Tropikalny, słodko-kwaskowy owoc nadaje deserowi świeżości i przełamuje delikatną słodycz bezy.",
    descriptionEn: "Crisp meringue layers are filled with light cream and juicy mango. The tropical fruit’s sweet-tart character adds freshness and offsets the delicate sweetness.",
  },
  {
    id: 1471,
    expectedName: "TORT BEZOWY CZARNY i OREO_CAP",
    manualConfirmed: true,
    sourcePage: "https://capuccinocafe.pl/produkt/tort-bezowy-jagody-oreo/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/02/34_4H1A2624.jpg",
    descriptionPl: "Krucha beza przełożona jest kremem z mascarpone i śmietany z kawałkami ciastek Oreo. Świeże jagody dodają soczystości i lekkiej kwasowości, równoważąc kakaową nutę ciastek oraz słodycz bezy.",
    descriptionEn: "Crisp meringue is layered with mascarpone cream and pieces of Oreo biscuit. Fresh blueberries add juiciness and gentle acidity, balancing the cocoa note and sweetness.",
  },
  {
    id: 1480,
    expectedName: "Tort brownie z białą czekoladą i owocami",
    manualConfirmed: true,
    sourcePage: "https://capuccinocafe.pl/produkt/tort-brownie-biala-czekolada-owoce/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/08/48_4H1A2716-scaled.jpg",
    descriptionPl: "Wilgotne brownie na gorzkiej czekoladzie łączy się z aksamitnym kremem z białej czekolady. Maliny i jagody dodają soczystej świeżości oraz lekkiej kwasowości, która równoważy intensywny smak ciasta.",
    descriptionEn: "Moist dark-chocolate brownie meets a silky white-chocolate cream. Raspberries and blueberries add juicy freshness and gentle acidity that balance the cake’s intensity.",
  },
  {
    id: 1497,
    expectedName: "Tort z paloną białą czekoladą",
    manualConfirmed: true,
    sourcePage: "https://capuccinocafe.pl/produkt/tort-palona-biala-czekolada/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/08/57_4H1A2747-scaled.jpg",
    descriptionPl: "Kremowy tort z paloną białą czekoladą, czerwoną porzeczką i mąką migdałową. Chrupiące elementy i owocowa kwasowość równoważą karmelową głębię czekolady.",
    descriptionEn: "A creamy cake with roasted white chocolate, redcurrant and almond flour. Crisp elements and bright fruit acidity balance the chocolate’s caramelised depth.",
  },
  {
    id: 1498,
    expectedName: "Tort z paloną białą czekoladą",
    manualConfirmed: true,
    sourcePage: "https://capuccinocafe.pl/produkt/tort-palona-biala-czekolada/",
    imageUrl: "https://capuccinocafe.pl/wp-content/uploads/2025/08/57_4H1A2747-scaled.jpg",
    descriptionPl: "Kremowy tort z paloną białą czekoladą, czerwoną porzeczką i mąką migdałową. Chrupiące elementy i owocowa kwasowość równoważą karmelową głębię czekolady.",
    descriptionEn: "A creamy cake with roasted white chocolate, redcurrant and almond flour. Crisp elements and bright fruit acidity balance the chocolate’s caramelised depth.",
  },
];

function normalizedName(value) {
  return value.replace(/_cap/gi, "").replace(/[_\s]+/g, " ").trim().toLocaleLowerCase("pl");
}

async function prepareImage(product) {
  const response = await fetch(product.imageUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      referer: `${new URL(product.imageUrl).origin}/`,
      "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Nie udało się pobrać zdjęcia ${product.id} (${response.status}).`);
  const source = Buffer.from(await response.arrayBuffer());
  if (!source.length || source.length > 12 * 1024 * 1024) throw new Error(`Nieprawidłowy rozmiar zdjęcia ${product.id}.`);
  const bytes = await sharp(source).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const fingerprint = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const filename = `${product.id}-${fingerprint}.webp`;
  return { filename, imagePath: `/api/product-images/${filename}`, bytes };
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const plans = [];
  for (const product of products) {
    const [current] = await sql`
      select p.id, p.name, p.dotykacka_supplier_id, pc.description_pl, pc.description_en,
             pc.image_source_url, pc.image_path
      from menu_products p
      left join product_content pc on pc.product_id = p.id
      where p.id = ${product.id}
    `;
    if (!current) throw new Error(`Brak produktu ${product.id}.`);
    if (normalizedName(current.name) !== normalizedName(product.expectedName)) {
      throw new Error(`Produkt ${product.id} zmienił nazwę: ${current.name}`);
    }
    const legacyCap = /_cap\b/i.test(current.name);
    const officialImage = /^https:\/\/capuccinocafe\.pl\//i.test(current.image_source_url || "");
    if (current.dotykacka_supplier_id !== CAPUCCINO_SUPPLIER_ID && !legacyCap && !officialImage && !product.manualConfirmed) {
      throw new Error(`Produkt ${product.id} nie ma potwierdzonego powiązania z Capuccino Cafe.`);
    }
    const needsDescriptionPl = !current.description_pl?.trim();
    const needsDescriptionEn = !current.description_en?.trim();
    const needsImage = !current.image_path?.trim();
    const linkSupplier = current.dotykacka_supplier_id !== CAPUCCINO_SUPPLIER_ID;
    plans.push({ product, current, needsDescriptionPl, needsDescriptionEn, needsImage, linkSupplier });
    console.log(JSON.stringify({
      mode: applyChanges ? "apply-plan" : "dry-run",
      id: product.id,
      name: current.name,
      sourcePage: product.sourcePage,
      descriptionPl: needsDescriptionPl ? "fill" : "keep",
      descriptionEn: needsDescriptionEn ? "fill" : "keep",
      image: needsImage ? "fill" : "keep",
      supplier: linkSupplier ? "link" : "keep",
    }));
  }

  if (applyChanges) {
    const preparedImages = new Map();
    for (const plan of plans.filter((item) => item.needsImage)) {
      preparedImages.set(plan.product.id, await prepareImage(plan.product));
    }
    await mkdir(uploadDirectory, { recursive: true });
    for (const image of preparedImages.values()) {
      await writeFile(path.join(uploadDirectory, image.filename), image.bytes, { flag: "wx" }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    }
    await sql.begin(async (transaction) => {
      for (const plan of plans) {
        const prepared = preparedImages.get(plan.product.id);
        const descriptionPl = plan.needsDescriptionPl ? plan.product.descriptionPl : plan.current.description_pl;
        const descriptionEn = plan.needsDescriptionEn ? plan.product.descriptionEn : plan.current.description_en;
        const imageSourceUrl = plan.needsImage ? plan.product.imageUrl : plan.current.image_source_url;
        const imagePath = prepared?.imagePath ?? plan.current.image_path;
        await transaction`
          insert into product_content (
            product_id, description_pl, description_en, image_source_url, image_path,
            content_approved, updated_at
          ) values (
            ${plan.product.id}, ${descriptionPl}, ${descriptionEn}, ${imageSourceUrl}, ${imagePath},
            true, now()
          )
          on conflict (product_id) do update set
            description_pl = excluded.description_pl,
            description_en = excluded.description_en,
            image_source_url = excluded.image_source_url,
            image_path = excluded.image_path,
            content_approved = true,
            updated_at = now()
        `;
        if (plan.linkSupplier) {
          await transaction`
            update menu_products
            set dotykacka_supplier_id = ${CAPUCCINO_SUPPLIER_ID},
                supplier_detected_at = coalesce(supplier_detected_at, now())
            where id = ${plan.product.id}
          `;
        }
      }
    });
  }

  console.log(JSON.stringify({
    mode: applyChanges ? "applied" : "dry-run",
    products: plans.length,
    descriptionsPl: plans.filter((item) => item.needsDescriptionPl).length,
    descriptionsEn: plans.filter((item) => item.needsDescriptionEn).length,
    images: plans.filter((item) => item.needsImage).length,
    supplierLinks: plans.filter((item) => item.linkSupplier).length,
  }));
} finally {
  await sql.end();
}
