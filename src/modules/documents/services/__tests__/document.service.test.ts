import { describe, expect, it, vi } from "vitest";

import type { PartnerWorkspaceContextService } from "../../../partner-cabinet/services";
import type { DocumentRepository } from "../../repositories";
import { DocumentService, validateProductDocumentFile } from "../document.service";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function workspace(active = true) {
  return {
    getWorkspaceContext: vi.fn().mockResolvedValue({
      accessState: active ? "active" : "pending",
      companyId: active ? COMPANY_ID : null,
      capabilities: {
        navigation: [{ key: "documents", availability: active ? "available" : "unavailable" }],
      },
    }),
  } as unknown as PartnerWorkspaceContextService;
}

function repository(): DocumentRepository {
  return {
    listPartner: vi.fn().mockResolvedValue({ items: [], totalCount: 61 }),
    getPartner: vi.fn(),
    authorizeDownload: vi.fn(),
    recordDownload: vi.fn(),
    search: vi.fn(),
    listAdmin: vi.fn(),
    getHealth: vi.fn(),
    getBuilderProducts: vi.fn(),
    registerProductDocument: vi.fn(),
    archiveProductDocument: vi.fn(),
  };
}

describe("DocumentService", () => {
  it("uses one bounded aggregate and derives company context server-side", async () => {
    const repo = repository();
    const service = new DocumentService(repo, workspace());

    const result = await service.listPartner(USER_ID, { query: "  invoice  ", page: 2, pageSize: 30 });

    expect(repo.listPartner).toHaveBeenCalledOnce();
    expect(repo.listPartner).toHaveBeenCalledWith(COMPANY_ID, expect.objectContaining({ query: "invoice", page: 2, pageSize: 30 }));
    expect(result.totalPages).toBe(3);
  });

  it("blocks document reads without an active document workspace", async () => {
    const repo = repository();
    await expect(new DocumentService(repo, workspace(false)).listPartner(USER_ID)).rejects.toThrow("Document Center is not available");
    expect(repo.listPartner).not.toHaveBeenCalled();
  });

  it("validates PDF signature, size, and deterministic checksum", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\ncontrolled test");
    expect(validateProductDocumentFile(bytes, "application/pdf")).toEqual({
      checksum: "8edf4e4417291962e0704aa8c353e889474fb86880cca937023e665502b09456",
      size: bytes.length,
    });
    expect(() => validateProductDocumentFile(new TextEncoder().encode("<html>"), "application/pdf")).toThrow("DOCUMENT_FILE_INVALID");
    expect(() => validateProductDocumentFile(bytes, "application/octet-stream")).toThrow("DOCUMENT_FILE_INVALID");
  });
});
