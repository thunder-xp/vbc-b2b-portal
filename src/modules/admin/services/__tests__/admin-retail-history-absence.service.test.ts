import { describe, expect, it, vi } from "vitest";

import type { AdminOperationsRepository } from "../../repositories";
import { AdminOperationsService } from "../admin-operations.service";

describe("AdminOperationsService RETAIL history absence diagnostic", () => {
  it("normalizes bounded filters and performs one repository read", async () => {
    const listProductsWithoutRetailHistory = vi.fn().mockResolvedValue({
      summary: {},
      categories: [],
      reasonCounts: {},
      page: 2,
      pageSize: 50,
      total: 65,
      records: [],
    });
    const service = new AdminOperationsService({
      listProductsWithoutRetailHistory,
    } as unknown as AdminOperationsRepository);

    await service.listProductsWithoutRetailHistory({
      search: `  ${"x".repeat(120)}  `,
      categoryId: "11111111-1111-1111-1111-111111111111",
      reason: "no_retail_register_record",
      page: 2,
      pageSize: 500,
    });

    expect(listProductsWithoutRetailHistory).toHaveBeenCalledTimes(1);
    expect(listProductsWithoutRetailHistory).toHaveBeenCalledWith({
      search: "x".repeat(100),
      categoryId: "11111111-1111-1111-1111-111111111111",
      reason: "no_retail_register_record",
      page: 2,
      pageSize: 50,
    });
  });

  it("drops unsupported category and reason values", async () => {
    const listProductsWithoutRetailHistory = vi.fn().mockResolvedValue({});
    const service = new AdminOperationsService({
      listProductsWithoutRetailHistory,
    } as unknown as AdminOperationsRepository);

    await service.listProductsWithoutRetailHistory({
      categoryId: "not-a-uuid",
      reason: "unknown_requires_review",
      page: -3,
    });

    expect(listProductsWithoutRetailHistory).toHaveBeenCalledWith({
      search: undefined,
      categoryId: undefined,
      reason: "unknown_requires_review",
      page: 1,
      pageSize: 25,
    });
  });
});
