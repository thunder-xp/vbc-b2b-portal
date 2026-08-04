import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyProductMappingEvidence } from "../current-product-mapping-audit";

const reference = "11111111-1111-1111-1111-111111111111";
const active = {
  reference,
  parentReference: "22222222-2222-2222-2222-222222222222",
  isFolder: false,
  deleted: false,
  inactive: false,
  accountingType: "Товар",
  isSet: false,
  sourceVersion: "v1",
  sourceModifiedAt: "2026-08-04T00:00:00",
};
const inside = { insideRoot: true, complete: true };

describe("current 1C product mapping audit", () => {
  it("recognizes an exact authoritative portal match", () => {
    expect(classifyProductMappingEvidence({
      reference,
      product: active,
      ancestry: inside,
      characteristicEvidence: [],
      exactPortalProductExists: true,
    }).classification).toBe("active_exact_match_available");
  });

  it("classifies an active sellable descendant missing locally as a portal defect", () => {
    expect(classifyProductMappingEvidence({ reference, product: active, ancestry: inside, characteristicEvidence: [] }))
      .toEqual({ classification: "portal_mapping_defect", evidenceCode: "active_sellable_descendant_missing_locally" });
  });

  it("classifies inactive and deleted source products without remapping", () => {
    expect(classifyProductMappingEvidence({ reference, product: { ...active, inactive: true }, ancestry: inside, characteristicEvidence: [] }).classification)
      .toBe("inactive_exact_match_available");
    expect(classifyProductMappingEvidence({ reference, product: { ...active, deleted: true }, ancestry: inside, characteristicEvidence: [] }).classification)
      .toBe("deleted_source_product");
  });

  it("requires an authoritative characteristic owner before base resolution", () => {
    expect(classifyProductMappingEvidence({
      reference,
      product: null,
      ancestry: { insideRoot: null, complete: true },
      characteristicEvidence: [{ exists: true, ownerMatchesProduct: false, deleted: false }],
    }).classification).toBe("characteristic_requires_base_resolution");
  });

  it("keeps incomplete ancestry and conflicting characteristics ambiguous", () => {
    expect(classifyProductMappingEvidence({ reference, product: active, ancestry: { insideRoot: null, complete: false }, characteristicEvidence: [] }).classification)
      .toBe("ambiguous_conflict");
    expect(classifyProductMappingEvidence({ reference, product: active, ancestry: inside, characteristicEvidence: [{ exists: true, ownerMatchesProduct: false, deleted: false }] }).classification)
      .toBe("ambiguous_conflict");
  });

  it("classifies outside-scope products and malformed references", () => {
    expect(classifyProductMappingEvidence({ reference, product: active, ancestry: { insideRoot: false, complete: true }, characteristicEvidence: [] }).classification)
      .toBe("outside_portal_scope");
    expect(classifyProductMappingEvidence({ reference: "bad", product: null, ancestry: { insideRoot: null, complete: true }, characteristicEvidence: [] }).classification)
      .toBe("malformed_source_reference");
  });

  it("keeps the audit read-only and independent of names or SKUs", () => {
    const source = readFileSync(join(process.cwd(), "src/modules/integration/audits/current-product-mapping-audit.ts"), "utf8");

    expect(source).toContain('.is("product_id", null)');
    expect(source).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/\.from\([^;]*?\.update\(/);
    expect(source).not.toMatch(/\.select\([^\n]*(?:sku|product_name)/i);
    expect(source).toContain("mapConcurrent");
    expect(source).toContain("productCache");
    expect(source).toContain("characteristicCache");
  });
});
