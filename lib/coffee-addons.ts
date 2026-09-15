export function isCoffeeAddonGroup(value: string | null | undefined) {
  return normalizeCoffeeOptionGroup(value) === "dodatki do kawy";
}

function normalizeCoffeeOptionGroup(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pl")
    .replace(/\s+/g, " ");
}

export function isAlternativeCoffeeBeanGroup(value: string | null | undefined) {
  const normalized = normalizeCoffeeOptionGroup(value);
  return /(?:^|\s)(?:wybierz\s+)?ziarn(?:o|a)(?:\s|$)/.test(normalized)
    && !/do\s+domu|opakowan|pacz/.test(normalized);
}

export function isSupportedCoffeeOptionGroup(value: string | null | undefined) {
  return isCoffeeAddonGroup(value) || isAlternativeCoffeeBeanGroup(value);
}
