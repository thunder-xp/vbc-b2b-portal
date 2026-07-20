import { afterEach, describe, expect, it, vi } from "vitest";

import { measureServerOperation } from "../server-timing";

describe("measureServerOperation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only safe timing metadata", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(measureServerOperation("catalog", "products", async () => [1, 2], (rows) => ({
      cacheState: "none",
      rowCount: rows.length,
    }))).resolves.toEqual([1, 2]);

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      cacheState: "none",
      event: "server_operation_timing",
      operation: "products",
      route: "catalog",
      rowCount: 2,
    }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/price|amount|company|1c/i);
  });
});
