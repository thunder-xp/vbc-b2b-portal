import type { PartnerPriceTypeDTO } from "../dto";

/** Preserve valid candidates when a distinct price reference is unavailable. */
export async function resolvePartnerPriceTypes(
  references: string[],
  lookup: (reference: string) => Promise<PartnerPriceTypeDTO | null>,
  requestKind: string,
  correlationId?: string,
): Promise<Map<string, PartnerPriceTypeDTO>> {
  const results = await Promise.all([...new Set(references)].map(async (priceTypeRef) => {
    try {
      return [priceTypeRef, await lookup(priceTypeRef)] as const;
    } catch (error) {
      console.warn({
        event: "one_c_partner_price_type_lookup_failed",
        priceTypeRef,
        requestKind,
        errorClass: error instanceof Error ? error.name : typeof error,
        ...(correlationId ? { correlationId } : {}),
      });
      return [priceTypeRef, null] as const;
    }
  }));
  return new Map(results.filter((entry): entry is readonly [string, PartnerPriceTypeDTO] => entry[1] !== null));
}
