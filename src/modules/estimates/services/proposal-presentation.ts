import type { CustomerProposalDto } from "../types";

const MAX_VISIBLE_DESCRIPTION_LENGTH = 220;

export function effectiveProposalSenderDisplayName(proposal: CustomerProposalDto): string {
  return proposal.settings.senderDisplayName?.trim() || proposal.branding.companyName;
}

export function conciseProposalDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_VISIBLE_DESCRIPTION_LENGTH) return normalized;

  const candidate = normalized.slice(0, MAX_VISIBLE_DESCRIPTION_LENGTH + 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > 160 ? boundary : MAX_VISIBLE_DESCRIPTION_LENGTH).trimEnd()}…`;
}

export function proposalLinePresentation(
  line: CustomerProposalDto["sections"][number]["lines"][number],
  settings?: CustomerProposalDto["settings"],
): { sku: string | null; productName: string | null; description: string | null } {
  const sku = line.sku?.trim();
  const productName = line.productName?.trim();
  const description = conciseProposalDescription(line.description);
  const visibleSku = settings?.showSku === false ? null : sku ? (/^sku(?:\s|-)/i.test(sku) ? sku : `SKU ${sku}`) : null;
  const visibleProductName = settings?.showProductName === false ? null : productName || null;
  const visibleDescription = settings?.showDescription === false ? null : description || null;

  return {
    sku: visibleSku,
    productName: visibleProductName,
    description: visibleDescription && visibleDescription.toLocaleLowerCase("ru-RU") !== visibleProductName?.toLocaleLowerCase("ru-RU")
      ? visibleDescription
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
  return schemaVersion === "2026-08-12-v4" || schemaVersion === "2026-09-14-v5" || schemaVersion === "2026-09-15-v6" ? sectionIndex + 1 : persistedPosition;
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
