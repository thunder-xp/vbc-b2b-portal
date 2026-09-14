export const ONE_C_PRICE_DOMAINS = [
  "PARTNER_CONTRACT_PRICE",
  "FINAL_CUSTOMER_RETAIL_PRICE",
  "INTERNAL/OTHER",
] as const;

export type OneCPriceDomain = (typeof ONE_C_PRICE_DOMAINS)[number];

const FINAL_CUSTOMER_RETAIL_PRICE_TYPE_REFS = new Set([
  "1668b73c-aea5-11f1-1b94-bc2411369b92", // A, BCR
  "eb632a56-aeb6-11f1-1b94-bc2411369b92", // B, BCR
  "fc52173c-aeb6-11f1-1b94-bc2411369b92", // C, BCR
]);

const GOVERNED_PARTNER_CONTRACT_PRICE_TYPE_REFS = new Set([
  "64592673-624e-4a13-849a-95a7336cfdc5", // Wholesale
  "d9c92519-658b-11e8-80d3-000c29a58b59", // MSRP
  "5c72ff41-88d6-11e8-80dd-000c29a58b59", // STOP
  "ec9609bd-919b-11e8-80e2-000c29a58b59", // DDP
  "e181c772-93fc-11e9-94cb-000c2988d323", // RETAIL contract price
  "60c4cbb2-f16d-11e9-86ae-000c29cf9dd4", // Service center
  "e71d8dd2-3eb0-11f0-8d8a-7239d3b7bd5c", // SILVER
  "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c", // GOLD
  "9adc073c-3eb5-11f0-8d8a-7239d3b7bd5c", // PLATINUM
  "3dcb5436-a5c0-11f0-0481-7239d3b7bd5c", // VIP
]);

export function classifyOneCPriceTypeRef(reference: string): OneCPriceDomain {
  const normalized = reference.trim().toLowerCase();
  if (FINAL_CUSTOMER_RETAIL_PRICE_TYPE_REFS.has(normalized)) {
    return "FINAL_CUSTOMER_RETAIL_PRICE";
  }
  if (GOVERNED_PARTNER_CONTRACT_PRICE_TYPE_REFS.has(normalized)) {
    return "PARTNER_CONTRACT_PRICE";
  }
  return "INTERNAL/OTHER";
}

export function isFinalCustomerRetailPriceType(reference: string): boolean {
  return classifyOneCPriceTypeRef(reference) === "FINAL_CUSTOMER_RETAIL_PRICE";
}

export function isGovernedPartnerContractPriceType(reference: string): boolean {
  return classifyOneCPriceTypeRef(reference) === "PARTNER_CONTRACT_PRICE";
}
