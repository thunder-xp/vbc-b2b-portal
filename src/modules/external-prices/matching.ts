import type { CatalogMatchCandidate, ExternalPriceMatch, ParsedExternalPriceRow } from "./types";
import { normalizeProductModel } from "./spreadsheet-parser";

export function matchExternalPriceRows(rows: ParsedExternalPriceRow[], candidates: CatalogMatchCandidate[]): ExternalPriceMatch[] {
  const exact = group(candidates, (candidate) => normalizeProductModel(candidate.normalizedModel || candidate.name));
  const aliases = new Map<string, CatalogMatchCandidate>();
  for (const candidate of candidates) for (const alias of candidate.aliases) aliases.set(normalizeProductModel(alias), candidate);
  const matches: ExternalPriceMatch[] = rows.map((row) => {
    const normalized = row.normalizedModel ?? "";
    const exactMatches = exact.get(normalized) ?? [];
    if (exactMatches.length === 1) return matched(row, exactMatches[0], "exact_model", "matched");
    const alias = aliases.get(normalized);
    if (alias) return matched(row, alias, "known_alias", "matched_alias");
    const suggestions = candidates.filter((candidate) => {
      const model = normalizeProductModel(candidate.normalizedModel || candidate.name);
      return normalized.length >= 8 && (model.startsWith(normalized) || normalized.startsWith(model));
    }).slice(0, 5);
    return {
      ...row,
      catalogProductId: null,
      matchMethod: suggestions.length ? "suggested" : "none",
      matchStatus: suggestions.length ? "needs_review" : "unmatched",
      suggestedProducts: suggestions.map(({ id, sku, name }) => ({ id, sku, name })),
    };
  });
  return requireReviewForConflictingExactPrices(matches, candidates);
}

function requireReviewForConflictingExactPrices(matches: ExternalPriceMatch[], candidates: CatalogMatchCandidate[]): ExternalPriceMatch[] {
  const byProduct = group(
    matches.filter((match) => match.catalogProductId && (match.partnerPrice !== null || match.retailPrice !== null)),
    (match) => match.catalogProductId ?? "",
  );
  const conflicting = new Set<string>();
  for (const [productId, productMatches] of byProduct) {
    const partnerPrices = new Set(productMatches.flatMap((match) => match.partnerPrice === null ? [] : [match.partnerPrice]));
    const retailPrices = new Set(productMatches.flatMap((match) => match.retailPrice === null ? [] : [match.retailPrice]));
    if (partnerPrices.size > 1 || retailPrices.size > 1) conflicting.add(productId);
  }
  if (!conflicting.size) return matches;
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return matches.map((match) => {
    const productId = match.catalogProductId;
    if (!productId || !conflicting.has(productId)) return match;
    const candidate = candidatesById.get(productId);
    return {
      ...match,
      catalogProductId: null,
      matchMethod: "suggested",
      matchStatus: "needs_review",
      suggestedProducts: candidate ? [{ id: candidate.id, sku: candidate.sku, name: candidate.name }] : [],
    };
  });
}

function matched(row: ParsedExternalPriceRow, candidate: CatalogMatchCandidate, method: "exact_model" | "known_alias", status: "matched" | "matched_alias"): ExternalPriceMatch {
  return { ...row, catalogProductId: candidate.id, matchMethod: method, matchStatus: status, suggestedProducts: [] };
}
function group<T>(values: T[], key: (value: T) => string): Map<string,T[]> { const map=new Map<string,T[]>(); for(const value of values){const k=key(value);map.set(k,[...(map.get(k)??[]),value]);} return map; }
