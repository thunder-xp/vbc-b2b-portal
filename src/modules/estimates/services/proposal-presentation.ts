import type { CustomerProposalDto } from "../types";

const MAX_VISIBLE_DESCRIPTION_LENGTH = 220;

export function conciseProposalDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_VISIBLE_DESCRIPTION_LENGTH) return normalized;

  const candidate = normalized.slice(0, MAX_VISIBLE_DESCRIPTION_LENGTH + 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > 160 ? boundary : MAX_VISIBLE_DESCRIPTION_LENGTH).trimEnd()}…`;
}

export function proposalLinePresentation(line: CustomerProposalDto["sections"][number]["lines"][number]): {
  identity: string;
  description: string | null;
} {
  const sku = line.sku?.trim();
  const productName = line.productName?.trim();
  const description = conciseProposalDescription(line.description);
  const identity = [sku ? (/^sku(?:\s|-)/i.test(sku) ? sku : `SKU ${sku}`) : null, productName].filter(Boolean).join("  ");

  if (!identity) return { identity: description, description: null };
  return {
    identity,
    description: description && description.toLocaleLowerCase("ru-RU") !== productName?.toLocaleLowerCase("ru-RU")
      ? description
      : null,
  };
}

export function sectionSubtotalLabel(sectionName: string): string {
  return `Итого за ${sectionName.trim().toLocaleLowerCase("ru-RU")}`;
}

export function proposalLineNumber(
  schemaVersion: CustomerProposalDto["schemaVersion"],
  sectionIndex: number,
  persistedPosition: number,
): number {
  return schemaVersion === "2026-08-12-v4" || schemaVersion === "2026-09-14-v5" ? sectionIndex + 1 : persistedPosition;
}

export function proposalVatLabels(proposal: CustomerProposalDto): {
  excludingVat: string;
  vat: string | null;
} {
  const rate = proposal.vatRatePercent ? ` (${formatNumber(proposal.vatRatePercent)}%)` : "";
  if (proposal.vatMode === "included") return { excludingVat: "Итого без НДС", vat: `В том числе НДС${rate}` };
  if (proposal.vatMode === "separate") return { excludingVat: "Итого без НДС", vat: `НДС${rate}` };
  return { excludingVat: "Итого без НДС", vat: null };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}
