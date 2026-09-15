import { unzipSync } from "fflate";

type Cell = string | number | null;

export type ReceiptHeader = {
  index: number;
  occurredAt: Date;
  positions: number;
  quantity: number;
  total: number;
  documentNumber: string;
  supplierId: string;
  supplierName: string;
};

export type PurchaseMovement = {
  index: number;
  occurredAt: Date;
  productName: string;
  ean: string;
  plu: string;
  quantity: number;
  total: number;
};

export type HistoricalAssignment = {
  movement: PurchaseMovement;
  receipt: ReceiptHeader;
};

export type HistoricalReportAnalysis = {
  receiptCount: number;
  purchaseLineCount: number;
  purchaseGroupCount: number;
  supplierCount: number;
  assignments: HistoricalAssignment[];
  unresolvedMovements: PurchaseMovement[];
};

const decoder = new TextDecoder();

function xmlText(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric: string | undefined, named: string | undefined) => {
    if (numeric) return String.fromCodePoint(numeric[0].toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number(numeric));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[named?.toLowerCase() ?? ""] ?? match;
  });
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function firstWorksheet(files: Record<string, Uint8Array>) {
  const name = Object.keys(files).filter((key) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(key)).sort()[0];
  if (!name) throw new Error("Plik nie zawiera arkusza danych.");
  return decoder.decode(files[name]);
}

export function readDotykackaWorkbook(buffer: Uint8Array): Cell[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch {
    throw new Error("Nie udało się otworzyć pliku Excel. Pobierz raport ponownie w formacie XLSX.");
  }
  const sharedXml = files["xl/sharedStrings.xml"] ? decoder.decode(files["xl/sharedStrings.xml"]) : "";
  const shared = Array.from(sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi), (match) =>
    Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi), (text) => xmlText(text[1])).join(""));
  const sheet = firstWorksheet(files);
  const rows: Cell[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row: Cell[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const reference = attributes.match(/\br="([^"]+)"/i)?.[1] ?? "A1";
      const type = attributes.match(/\bt="([^"]+)"/i)?.[1] ?? "n";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/i)?.[1];
      let value: Cell = null;
      if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = xmlText(Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi), (text) => text[1]).join(""));
      else if (raw !== undefined && raw !== "") value = Number.isFinite(Number(raw)) ? Number(raw) : xmlText(raw);
      row[columnIndex(reference)] = value;
    }
    rows.push(row);
  }
  return rows;
}

function excelDate(value: Cell) {
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86_400_000));
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) throw new Error(`Nieprawidłowa data w raporcie: ${text || "puste pole"}.`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)));
}

function numberCell(value: Cell) {
  const result = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(result) ? result : 0;
}

function rounded(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function headers(row: Cell[]) {
  return new Map(row.map((value, index) => [String(value ?? "").trim(), index]));
}

function required(columns: Map<string, number>, names: string[], reportName: string) {
  for (const name of names) if (!columns.has(name)) throw new Error(`${reportName} nie zawiera kolumny „${name}”. Wybierz właściwy raport bez zmiany kolumn.`);
}

export function parseReceiptHeaders(buffer: Uint8Array): ReceiptHeader[] {
  const rows = readDotykackaWorkbook(buffer);
  if (!rows.length) throw new Error("Lista przyjęć jest pusta.");
  const columns = headers(rows[0]);
  required(columns, ["Data utworzenia", "Pozycje", "Cena zakupu netto", "Ilość", "Dokument dostawy", "ID dostawcy", "Dostawca"], "Lista przyjęć");
  const at = (row: Cell[], name: string) => row[columns.get(name)!];
  return rows.slice(1).map((row, index) => ({
    index,
    occurredAt: excelDate(at(row, "Data utworzenia")),
    positions: Math.round(numberCell(at(row, "Pozycje"))),
    quantity: rounded(numberCell(at(row, "Ilość")), 3),
    total: rounded(numberCell(at(row, "Cena zakupu netto")), 2),
    documentNumber: String(at(row, "Dokument dostawy") ?? "").trim(),
    supplierId: String(at(row, "ID dostawcy") ?? "").trim(),
    supplierName: String(at(row, "Dostawca") ?? "").trim(),
  })).filter((row) => row.positions > 0 && row.supplierId && row.supplierName);
}

export function parsePurchaseMovements(buffer: Uint8Array): PurchaseMovement[] {
  const rows = readDotykackaWorkbook(buffer);
  if (!rows.length) throw new Error("Raport przyjęć magazynowych jest pusty.");
  const columns = headers(rows[0]);
  required(columns, ["Data utworzenia", "Rodzaj transakcji", "Produkt", "EAN", "PLU", "Ilość", "Łączna cena zakupu netto"], "Raport przyjęć magazynowych");
  const at = (row: Cell[], name: string) => row[columns.get(name)!];
  return rows.slice(1).map((row, index) => ({ row, index })).filter(({ row }) => String(at(row, "Rodzaj transakcji") ?? "").trim() === "Zakup").map(({ row, index }) => ({
    index,
    occurredAt: excelDate(at(row, "Data utworzenia")),
    productName: String(at(row, "Produkt") ?? "").trim(),
    ean: String(at(row, "EAN") ?? "").trim(),
    plu: String(at(row, "PLU") ?? "").trim(),
    quantity: rounded(numberCell(at(row, "Ilość")), 3),
    total: rounded(numberCell(at(row, "Łączna cena zakupu netto")), 2),
  }));
}

type MovementGroup = { occurredAt: Date; movements: PurchaseMovement[] };

function minuteKey(date: Date) { return date.toISOString().slice(0, 16); }
function dayKey(date: Date) { return date.toISOString().slice(0, 10); }
function signature(positions: number, quantity: number, total: number) { return `${positions}|${rounded(quantity, 3).toFixed(3)}|${rounded(total, 2).toFixed(2)}`; }
function movementSignature(group: MovementGroup) { return signature(group.movements.length, group.movements.reduce((sum, row) => sum + row.quantity, 0), group.movements.reduce((sum, row) => sum + row.total, 0)); }
function receiptSignature(row: ReceiptHeader) { return signature(row.positions, row.quantity, row.total); }
function totalsMatch(receipts: ReceiptHeader[], movements: PurchaseMovement[]) {
  return receipts.reduce((sum, row) => sum + row.positions, 0) === movements.length
    && Math.abs(receipts.reduce((sum, row) => sum + row.quantity, 0) - movements.reduce((sum, row) => sum + row.quantity, 0)) <= 0.006
    && Math.abs(receipts.reduce((sum, row) => sum + row.total, 0) - movements.reduce((sum, row) => sum + row.total, 0)) <= 0.06;
}

function subsets(rows: PurchaseMovement[], indexes: number[], count: number, targetQuantity: number, targetTotal: number, limit = 3) {
  const results: number[][] = [];
  const visit = (start: number, selected: number[], quantity: number, total: number) => {
    if (results.length >= limit) return;
    if (selected.length === count) {
      if (Math.abs(quantity - targetQuantity) <= 0.006 && Math.abs(total - targetTotal) <= 0.06) results.push([...selected]);
      return;
    }
    const needed = count - selected.length;
    for (let position = start; position <= indexes.length - needed; position += 1) {
      const index = indexes[position];
      visit(position + 1, [...selected, index], quantity + rows[index].quantity, total + rows[index].total);
      if (results.length >= limit) return;
    }
  };
  visit(0, [], 0, 0);
  return results;
}

function partitionGroup(group: MovementGroup, receiptRows: ReceiptHeader[]) {
  if (!totalsMatch(receiptRows, group.movements)) return null;
  if (new Set(receiptRows.map((row) => row.supplierId)).size === 1) return group.movements.map((movement) => ({ movement, receipt: receiptRows[0] }));
  const ordered = [...receiptRows].sort((a, b) => a.positions - b.positions);
  const solutions: HistoricalAssignment[][] = [];
  const visit = (receiptIndex: number, remaining: number[], assignments: HistoricalAssignment[]) => {
    if (solutions.length >= 2) return;
    if (receiptIndex === ordered.length - 1) {
      const receipt = ordered[receiptIndex];
      const movements = remaining.map((index) => group.movements[index]);
      if (totalsMatch([receipt], movements)) solutions.push([...assignments, ...movements.map((movement) => ({ movement, receipt }))]);
      return;
    }
    const receipt = ordered[receiptIndex];
    for (const selected of subsets(group.movements, remaining, receipt.positions, receipt.quantity, receipt.total)) {
      const used = new Set(selected);
      visit(receiptIndex + 1, remaining.filter((index) => !used.has(index)), [...assignments, ...selected.map((index) => ({ movement: group.movements[index], receipt }))]);
    }
  };
  visit(0, group.movements.map((_, index) => index), []);
  if (solutions.length === 1) return solutions[0];
  if (solutions.length > 1) {
    const mapping = (solution: HistoricalAssignment[]) => [...solution].sort((a, b) => a.movement.index - b.movement.index).map((item) => item.receipt.supplierId).join("|");
    if (mapping(solutions[0]) === mapping(solutions[1])) return solutions[0];
  }
  return null;
}

function groupCombinations(groups: MovementGroup[], receipt: ReceiptHeader, limit = 2) {
  const results: MovementGroup[][] = [];
  const visit = (start: number, selected: MovementGroup[]) => {
    if (results.length >= limit || selected.length >= 4) return;
    for (let index = start; index < groups.length; index += 1) {
      const next = [...selected, groups[index]];
      const movements = next.flatMap((group) => group.movements);
      if (totalsMatch([receipt], movements)) results.push(next);
      else if (movements.length < receipt.positions) visit(index + 1, next);
      if (results.length >= limit) return;
    }
  };
  visit(0, []);
  return results;
}

export function analyzeHistoricalReports(receipts: ReceiptHeader[], movements: PurchaseMovement[]): HistoricalReportAnalysis {
  const groups = Array.from(movements.reduce((map, movement) => {
    const key = movement.occurredAt.toISOString();
    const group = map.get(key) ?? { occurredAt: movement.occurredAt, movements: [] };
    group.movements.push(movement); map.set(key, group); return map;
  }, new Map<string, MovementGroup>()).values());
  const usedReceipts = new Set<number>();
  const usedMovements = new Set<number>();
  const assignments: HistoricalAssignment[] = [];

  for (const group of groups) {
    const candidates = receipts.filter((receipt) => !usedReceipts.has(receipt.index) && minuteKey(receipt.occurredAt) === minuteKey(group.occurredAt) && receiptSignature(receipt) === movementSignature(group));
    if (candidates.length !== 1) continue;
    const receipt = candidates[0]; usedReceipts.add(receipt.index);
    for (const movement of group.movements) { usedMovements.add(movement.index); assignments.push({ movement, receipt }); }
  }

  for (const group of groups.filter((item) => item.movements.some((movement) => !usedMovements.has(movement.index)))) {
    const sameDay = receipts.filter((receipt) => !usedReceipts.has(receipt.index) && dayKey(receipt.occurredAt) === dayKey(group.occurredAt));
    const partition = partitionGroup(group, sameDay);
    if (!partition) continue;
    for (const item of partition) { usedMovements.add(item.movement.index); usedReceipts.add(item.receipt.index); assignments.push(item); }
  }

  const remainingGroups = groups.filter((item) => item.movements.every((movement) => !usedMovements.has(movement.index)));
  for (const receipt of receipts.filter((item) => !usedReceipts.has(item.index))) {
    const combinations = groupCombinations(remainingGroups.filter((group) => group.movements.every((movement) => !usedMovements.has(movement.index))), receipt);
    if (combinations.length !== 1) continue;
    usedReceipts.add(receipt.index);
    for (const group of combinations[0]) for (const movement of group.movements) {
      usedMovements.add(movement.index); assignments.push({ movement, receipt });
    }
  }

  return {
    receiptCount: receipts.length,
    purchaseLineCount: movements.length,
    purchaseGroupCount: groups.length,
    supplierCount: new Set(receipts.map((row) => row.supplierId)).size,
    assignments,
    unresolvedMovements: movements.filter((movement) => !usedMovements.has(movement.index)),
  };
}
