"use client";

export const COMPARISON_LIMIT = 4;
export const COMPARISON_CHANGED_EVENT = "novotech:comparison-changed";

export function comparisonStorageKey(companyId: string, userId: string): string {
  return `novotech-catalog-compare:${companyId}:${userId}`;
}

export function readComparisonIds(companyId: string, userId: string): string[] {
  const key = comparisonStorageKey(companyId, userId);
  const canonical = readIds(key);
  const legacyPrefix = `${key}:`;
  const legacy = Object.keys(localStorage)
    .filter((candidate) => candidate.startsWith(legacyPrefix))
    .flatMap(readIds);
  const merged = normalizeIds([...canonical, ...legacy]);

  if (!sameIds(canonical, merged)) {
    localStorage.setItem(key, JSON.stringify(merged));
  }

  return merged;
}

export function writeComparisonIds(
  companyId: string,
  userId: string,
  productIds: string[],
): string[] {
  const key = comparisonStorageKey(companyId, userId);
  const normalized = normalizeIds(productIds);
  localStorage.setItem(key, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(COMPARISON_CHANGED_EVENT, {
    detail: { key },
  }));
  return normalized;
}

function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? normalizeIds(value.filter((item): item is string => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

function normalizeIds(productIds: string[]): string[] {
  return [...new Set(productIds.map((id) => id.trim()).filter(Boolean))]
    .slice(0, COMPARISON_LIMIT);
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
