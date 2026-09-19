type AlcoholSaleProduct = {
  name: string;
  kind: string;
  serving: "glass" | "bottle" | "draught" | "serving" | null;
  alcoholFree: boolean;
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pl");
}

export function isWholeVodkaBottleName(name: string) {
  const value = normalized(name);
  return /\bwodka\b/.test(value) && !/\b50\s*ml\b|shot|kielisz/.test(value);
}

export function warsawMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isAlcoholTakeawayRestrictionTime(date = new Date()) {
  const minute = warsawMinutes(date);
  return minute >= 21 * 60 + 58 || minute <= 6 * 60 + 2;
}

export function shouldShowAlcoholSaleWarning(product: AlcoholSaleProduct, date = new Date()) {
  if (product.alcoholFree || product.serving !== "bottle") return false;
  const restrictedBottle = ["beer", "wine", "whisky"].includes(product.kind)
    || (product.kind === "cocktails" && isWholeVodkaBottleName(product.name));
  return restrictedBottle && isAlcoholTakeawayRestrictionTime(date);
}
