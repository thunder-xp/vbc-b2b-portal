import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  updateLogo: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../services", () => ({
  requireAdminPermission: mocks.requirePermission,
  createAdminPublicPartnerDirectoryService: () => ({ updateLogo: mocks.updateLogo }),
}));

import { updateAdminCompanyLogoAction } from "../admin-public-partner-directory.actions";

const companyId = "32cdb925-2e0b-4541-967c-f22b7f06f376";
const oldPath = `${companyId}/08d3ebea-8750-49e6-9182-c155db06571f.jpg`;

describe("admin company logo action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.requirePermission.mockResolvedValue({ userId: "admin" });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.updateLogo.mockImplementation(async (input) => ({
      companyId,
      previousLogoAssetPath: oldPath,
      logoAssetPath: input.logoAssetPath,
      revision: 2,
      visible: true,
      changed: true,
      auditEventId: "50a675ca-bc65-4748-ab91-20a438974bea",
      correlationId: input.correlationId,
    }));
  });

  it("uploads through the server transport, updates the canonical reference, and cleans the old asset", async () => {
    const form = uploadForm(pngFile("company.png"));
    const result = await updateAdminCompanyLogoAction({ status: "idle", message: "" }, form);

    expect(result).toEqual({ status: "success", message: "Логотип компании обновлён." });
    expect(mocks.requirePermission).toHaveBeenCalledWith("admin.catalog.manage");
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${companyId}/[0-9a-f-]{36}\\.png$`)),
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: false },
    );
    expect(mocks.updateLogo).toHaveBeenCalledWith(expect.objectContaining({
      companyId,
      expectedRevision: 1,
      logoAssetPath: expect.stringMatching(new RegExp(`^${companyId}/`)),
    }));
    expect(mocks.remove).toHaveBeenCalledWith([oldPath]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/partners/public-directory");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/partners");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cabinet", "layout");
  });

  it("removes the canonical logo without uploading another object", async () => {
    const form = new FormData();
    form.set("companyId", companyId);
    form.set("revision", "1");
    form.set("intent", "remove");
    const result = await updateAdminCompanyLogoAction({ status: "idle", message: "" }, form);

    expect(result).toEqual({ status: "success", message: "Логотип компании удалён." });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.updateLogo).toHaveBeenCalledWith(expect.objectContaining({ logoAssetPath: null }));
    expect(mocks.remove).toHaveBeenCalledWith([oldPath]);
  });

  it("rejects an unauthorized actor before storage access", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("PERMISSION_REQUIRED"));
    const result = await updateAdminCompanyLogoAction(
      { status: "idle", message: "" },
      uploadForm(pngFile("company.png")),
    );

    expect(result.status).toBe("error");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.updateLogo).not.toHaveBeenCalled();
  });

  it("rejects mismatched MIME and extension before storage access", async () => {
    const result = await updateAdminCompanyLogoAction(
      { status: "idle", message: "" },
      uploadForm(pngFile("company.jpg")),
    );

    expect(result).toEqual({
      status: "error",
      message: "Используйте PNG, JPG или WebP с корректным расширением файла.",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("removes the new orphan when the canonical database update fails", async () => {
    mocks.updateLogo.mockRejectedValue(new Error("DATABASE_FAILED"));
    const result = await updateAdminCompanyLogoAction(
      { status: "idle", message: "" },
      uploadForm(pngFile("company.png")),
    );

    expect(result.status).toBe("error");
    const uploadedPath = mocks.upload.mock.calls[0]?.[0];
    expect(mocks.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("keeps the successful reference when obsolete-file cleanup fails", async () => {
    mocks.remove.mockResolvedValue({ error: new Error("cleanup failed") });
    const result = await updateAdminCompanyLogoAction(
      { status: "idle", message: "" },
      uploadForm(pngFile("company.png")),
    );

    expect(result.status).toBe("success");
    expect(console.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "admin_company_logo_obsolete_asset_cleanup_failed",
      companyId,
    }));
  });
});

function uploadForm(file: File) {
  const form = new FormData();
  form.set("companyId", companyId);
  form.set("revision", "1");
  form.set("logo", file);
  return form;
}

function pngFile(name: string) {
  return new File([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ], name, { type: "image/png" });
}
