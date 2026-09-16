import { describe, expect, it } from "vitest";
import { resolveWorkspaceCapabilities } from "@/src/modules/partner-cabinet/services/workspace-capability.service";

describe("Installation Marketplace Partner activation navigation",()=>{
  it("exposes activation and order workspaces only through Marketplace permission",()=>{
    const authorized=resolveWorkspaceCapabilities(new Set(["installation_marketplace.manage"]));
    expect(authorized.navigation.filter((item)=>item.key.startsWith("installation_"))).toEqual([
      expect.objectContaining({key:"installation_marketplace",href:"/cabinet/installation-marketplace"}),
      expect.objectContaining({key:"installation_orders",href:"/cabinet/installation-orders"}),
    ]);
    expect(resolveWorkspaceCapabilities(new Set()).navigation.some((item)=>item.key.startsWith("installation_"))).toBe(false);
  });
});
