const PRODUCT_DETAILS_HEADING = /(?:^|\s)(?:ОСНОВНЫЕ\s+ХАРАКТЕРИСТИКИ\s+И\s+ПРЕИМУЩЕСТВА|КЛЮЧЕВЫЕ\s+ПРЕИМУЩЕСТВА|ТЕХНИЧЕСКИЕ\s+ХАРАКТЕРИСТИКИ|ОБЛАСТЬ\s+ПРИМЕНЕНИЯ|ИНСТРУКЦИЯ)\s*:?(?=\s|[.!?]|$)/iu;
const CITATION_ARTIFACT = /\[(?:cite|citation|source)\s*:\s*[^\]]+\]/giu;
const MAX_SUMMARY_LENGTH = 500;
const MAX_SENTENCES = 5;

/** Produces the bounded customer-facing introduction used by estimate snapshots. */
export function deriveProductDescriptionSummary(
  source: string | null | undefined,
  fallback: string | null | undefined,
): string {
  const normalizedSource = normalizeRichText(source ?? "");
  const heading = PRODUCT_DETAILS_HEADING.exec(normalizedSource);
  const introduction = (heading ? normalizedSource.slice(0, heading.index) : normalizedSource).trim();
  const candidate = introduction || normalizeRichText(fallback ?? "");
  if (!candidate) return "";

  const sentences = candidate.match(/[^.!?]+(?:[.!?]+|$)/gu)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 2)
    .slice(0, MAX_SENTENCES) ?? [candidate];
  const summary = sentences.join(" ").replace(/\s+/gu, " ").trim();
  if (summary.length <= MAX_SUMMARY_LENGTH) return summary;
  const clipped = summary.slice(0, MAX_SUMMARY_LENGTH + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 320 ? boundary : MAX_SUMMARY_LENGTH).trimEnd()}…`;
}

/** Identifies the untouched legacy product-name description without weakening manual overrides. */
export function isDefaultProductDescription(
  description: string | null | undefined,
  productName: string | null | undefined,
): boolean {
  return normalizeComparableText(description) === normalizeComparableText(productName);
}

function normalizeRichText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/giu, ". ")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/giu, ". ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(CITATION_ARTIFACT, "")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s*\.\s*\./gu, ". ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeComparableText(value: string | null | undefined): string {
  return normalizeRichText(value ?? "").toLocaleLowerCase();
}
