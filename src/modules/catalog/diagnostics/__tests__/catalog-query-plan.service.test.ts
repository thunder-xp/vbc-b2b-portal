import { describe, expect, it } from "vitest";

import { summarizePlan } from "../catalog-query-plan.service";

describe("summarizePlan", () => {
  it("returns only bounded plan diagnostics from nested plan nodes", () => {
    const summary = summarizePlan("catalog_page", [{
      "Planning Time": 1.25,
      "Execution Time": 42.5,
      Plan: {
        "Node Type": "Sort",
        "Actual Rows": 12,
        "Shared Hit Blocks": 90,
        "Shared Read Blocks": 4,
        "Temp Read Blocks": 2,
        "Temp Written Blocks": 3,
        "Sort Method": "quicksort",
        Plans: [
          { "Node Type": "Index Scan", "Index Name": "catalog_products_slug_key" },
          { "Node Type": "Seq Scan" },
        ],
      },
    }]);

    expect(summary).toEqual({
      operation: "catalog_page",
      planningTimeMs: 1.25,
      executionTimeMs: 42.5,
      rows: 12,
      sharedHitBlocks: 90,
      sharedReadBlocks: 4,
      temporaryBlocks: 5,
      sortMethods: ["quicksort"],
      indexNames: ["catalog_products_slug_key"],
      hasSequentialScan: true,
    });
  });

  it("rejects an unexpected database response", () => {
    expect(() => summarizePlan("catalog_facets", { Plan: {} })).toThrow(
      "Catalog query plan response is invalid.",
    );
  });
});
