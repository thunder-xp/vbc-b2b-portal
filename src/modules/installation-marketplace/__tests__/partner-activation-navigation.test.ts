import { describe, expect, it } from "vitest";
import { resolveWorkspaceCapabilities } from "@/src/modules/partner-cabinet/services/workspace-capability.service";

describe("Installation workspace navigation",()=>{
  it("exposes exactly one canonical installation workspace through Marketplace permission",()=>{
    const authorized=resolveWorkspaceCapabilities(new Set(["installation_marketplace.manage"]));
    expect(authorized.navigation.filter((item)=>item.key.startsWith("installation_"))).toEqual([
      expect.objectContaining({key:"installation_marketplace",href:"/cabinet/installation-marketplace",label:"Монтаж и заявки"}),
    ]);
    expect(authorized.navigation.some((item)=>item.href==="/cabinet/installation-orders")).toBe(false);
    expect(resolveWorkspaceCapabilities(new Set()).navigation.some((item)=>item.key.startsWith("installation_"))).toBe(false);
  });
});
