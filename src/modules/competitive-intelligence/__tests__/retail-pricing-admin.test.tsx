import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminCompetitorRetailImportReview } from "../components/AdminCompetitorRetailImportReview";
import { buildMigratedRetailImportRows } from "../retail-pricing.service";
import type { AdminCompetitorRetailImportDetail } from "../types";

describe("admin competitor retail import detail", () => {
  it("uses the governed legacy linkage without reading partner row tables in the request path", () => {
    const repository = readFileSync(resolve("src/modules/competitive-intelligence/retail-pricing.repository.ts"), "utf8");
    expect(repository).toContain("legacy_external_price_upload_id");
    expect(repository).toContain("attachMappedProducts(detail.rows)");
    expect(repository).not.toContain('from("external_price_import_rows")');
  });

  it("reconstructs applied mapped, skipped, and unmatched rows from immutable source evidence", () => {
    const rows = buildMigratedRetailImportRows("import-1", "USD", [
      match(2, "matched", "product-1"),
      match(3, "needs_review", null),
      match(4, "unmatched", null),
    ], [{ sheet: "Price", row: 2, productId: "product-1" }]);
    expect(rows.map((row) => [row.row, row.status, row.productId])).toEqual([
      [2, "mapped", "product-1"], [3, "ignored", null], [4, "unmapped", null],
    ]);
  });

  it("shows exact mapped product identity and keeps applied unmatched rows read-only", () => {
    render(<AdminCompetitorRetailImportReview canManage detail={detail("applied")} />);
    expect(screen.getByRole("link", { name: "130263 · DHI-NVR4232-EI" })).toHaveAttribute(
      "href",
      "/admin/market-intelligence/products/product-1",
    );
    expect(screen.getByText("Требуется сопоставление")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Поиск товара Novotech" })).not.toBeInTheDocument();
  });

  it("preserves the governed mapping controls for imports awaiting review", () => {
    render(<AdminCompetitorRetailImportReview canManage detail={detail("ready_for_review")} />);
    expect(screen.getByRole("textbox", { name: "Поиск товара Novotech" })).toBeInTheDocument();
  });
});

function detail(status: AdminCompetitorRetailImportDetail["status"]): AdminCompetitorRetailImportDetail {
  return {
    id: "import-1", competitorId: "competitor-1", competitorName: "Exterior", fileName: "Exterior.xlsx",
    effectiveDate: "2026-08-08", currency: "USD", snapshotScope: "full", status,
    detectedMapping: null, confirmedMapping: null, totalRows: 2, candidateRows: 2, matchedRows: 1,
    reviewRows: status === "ready_for_review" ? 1 : 0, unmappedRows: 1, ignoredRows: 0, markerRows: 0,
    changedRows: 1, unchangedRows: 0, safeErrorCode: null, createdAt: "2026-08-25T00:00:00Z",
    appliedAt: status === "applied" ? "2026-08-25T00:00:00Z" : null, correlationId: "correlation-1",
    rows: [
      {
        id: "row-1", competitorProductId: "competitor-product-1", sku: "EXT-1", model: "NVR4232",
        name: "Exterior NVR", description: null, price: 519, currency: "USD", sheet: "Price", row: 2,
        productId: "product-1", mappedProduct: { id: "product-1", sku: "130263", name: "DHI-NVR4232-EI" },
        matchMethod: "manual", status: "mapped", suggestions: [],
      },
      {
        id: "row-2", competitorProductId: "competitor-product-2", sku: "EXT-2", model: "UNKNOWN",
        name: "Unknown product", description: null, price: 100, currency: "USD", sheet: "Price", row: 3,
        productId: null, matchMethod: "none", status: "unmapped", suggestions: [],
      },
    ],
  };
}

function match(row: number, status: "matched" | "needs_review" | "unmatched", productId: string | null) {
  return {
    sheet: "Price", row, sourceCode: `EXT-${row}`, sourceName: `Exterior ${row}`, normalizedModel: `MODEL-${row}`,
    description: null, partnerPrice: null, retailPrice: 100 + row, marker: null, catalogProductId: productId,
    matchMethod: status === "matched" ? "exact_model" as const : status === "needs_review" ? "suggested" as const : "none" as const,
    matchStatus: status, suggestedProducts: [],
  };
}
