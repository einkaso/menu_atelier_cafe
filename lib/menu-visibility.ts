export function menuProductVisibleForGuest(
  dotykackaDisplay: boolean,
  manualHidden: boolean | null | undefined,
  waiterVisibilityOverride: boolean | null | undefined,
) {
  if (manualHidden) return false;
  return waiterVisibilityOverride ?? dotykackaDisplay;
}

export const MENU_VISIBILITY_REASONS = [
  "Zmiana dostępności w witrynie",
  "Produkt wyprzedany",
  "Produkt ponownie dostępny",
  "Decyzja osoby odpowiedzialnej za zmianę",
] as const;
