import type { PriceRegisterStageRow } from "../providers/one-c";

export type PricePageDiagnostics = {
  received: number;
  uniqueKeys: number;
  duplicateKeys: number;
  rowsDeduplicated: number;
};

export type NormalizedPricePage = {
  rows: PriceRegisterStageRow[];
  diagnostics: PricePageDiagnostics;
};

export function normalizePricePage(rows: PriceRegisterStageRow[]): NormalizedPricePage {
  const winners = new Map<string, { row: PriceRegisterStageRow; sourceIndex: number }>();
  const occurrences = new Map<string, number>();
  for (const [sourceIndex, row] of rows.entries()) {
    const key = logicalKey(row);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    const current = winners.get(key);
    if (!current || compareCandidates({ row, sourceIndex }, current) > 0) winners.set(key, { row, sourceIndex });
  }
  const normalized = [...winners.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidate]) => candidate.row);
  const duplicateKeys = [...occurrences.values()].filter((count) => count > 1).length;
  return { rows: normalized, diagnostics: { received: rows.length, uniqueKeys: normalized.length, duplicateKeys, rowsDeduplicated: rows.length - normalized.length } };
}

function logicalKey(row: PriceRegisterStageRow): string { return `${row.externalProductRef}:${row.externalPriceTypeRef}:${row.externalCharacteristicRef}`; }
function compareCandidates(left: { row: PriceRegisterStageRow; sourceIndex: number }, right: { row: PriceRegisterStageRow; sourceIndex: number }): number {
  const effective = Date.parse(left.row.effectiveAt) - Date.parse(right.row.effectiveAt);
  if (effective !== 0) return effective;
  if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex;
  if (left.row.isCurrent !== right.row.isCurrent) return left.row.isCurrent ? -1 : 1;
  return stableTieBreaker(left.row).localeCompare(stableTieBreaker(right.row));
}
function stableTieBreaker(row: PriceRegisterStageRow): string { return [row.effectiveAt, String(row.isCurrent), String(row.amount), row.externalProductRef, row.externalPriceTypeRef, row.externalCharacteristicRef].join("\u0000"); }
