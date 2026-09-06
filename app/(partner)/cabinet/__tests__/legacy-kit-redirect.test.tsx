import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/purchasing-lists/actions/purchasing-list.actions", () => ({ resolveLegacyPurchasingListAction: mocks.resolve }));
import Page from "../purchase-templates/[templateId]/page";

describe("legacy recovered kit navigation", () => {
  it("opens the exact authorized canonical identity", async () => {
    mocks.resolve.mockResolvedValue({ success: true, data: "recovered-id" });
    await expect(Page({ params: Promise.resolve({ templateId: "legacy-id" }) })).rejects.toThrow("REDIRECT:/cabinet/purchasing-lists/recovered-id");
    expect(mocks.resolve).toHaveBeenLastCalledWith("legacy-id");
  });
  it.each([{ success: true, data: null }, { success: false, data: null }])("keeps safe fallback without leaking an inaccessible kit", async (result) => {
    mocks.resolve.mockResolvedValue(result);
    await expect(Page({ params: Promise.resolve({ templateId: "legacy-id" }) })).rejects.toThrow("REDIRECT:/cabinet/purchasing-lists");
  });
});
