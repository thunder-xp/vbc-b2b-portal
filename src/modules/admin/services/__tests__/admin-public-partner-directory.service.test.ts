import { describe, expect, it, vi } from "vitest";

import type { AdminPublicPartnerDirectoryRepository } from "../../repositories";
import { AdminPublicPartnerDirectoryService } from "../admin-public-partner-directory.service";

const companyId = "32cdb925-2e0b-4541-967c-f22b7f06f376";
const correlationId = "fe5a721e-faa6-4ef0-aaac-9ac6ee80eca1";

function repository(): AdminPublicPartnerDirectoryRepository {
  return {
    list: vi.fn().mockResolvedValue({ records: [], totalCount: 26, publishedCount: 3, page: 1, pageSize: 25 }),
    update: vi.fn().mockResolvedValue({ companyId, revision: 2, visible: true, changed: true, correlationId }),
  };
}

describe("admin public partner-directory service", () => {
  it("uses one bounded repository read with normalized search and filter", async () => {
    const repo = repository();
    const result = await new AdminPublicPartnerDirectoryService(repo).list({
      page: "1",
      search: "  Pilot  ",
      filter: "visible",
    });
    expect(repo.list).toHaveBeenCalledWith({ page: 1, pageSize: 25, search: "Pilot", filter: "visible" });
    expect(result.totalPages).toBe(2);
  });

  it.each([true, false])("supports audited visibility value %s", async (visible) => {
    const repo = repository();
    await new AdminPublicPartnerDirectoryService(repo).update({
      companyId,
      expectedRevision: 1,
      publicDisplayName: "  Pilot Partner  ",
      visible,
      useCurrentLogo: true,
      correlationId,
    });
    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ publicDisplayName: "Pilot Partner", visible }));
  });

  it("rejects publication without an explicit public name before the RPC", async () => {
    const repo = repository();
    expect(() => new AdminPublicPartnerDirectoryService(repo).update({
      companyId,
      expectedRevision: 1,
      publicDisplayName: " ",
      visible: true,
      useCurrentLogo: false,
      correlationId,
    })).toThrow("PUBLIC_PARTNER_NAME_REQUIRED");
    expect(repo.update).not.toHaveBeenCalled();
  });
});
