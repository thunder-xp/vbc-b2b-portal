import { describe, expect, it } from "vitest";
import { resolveWorkspaceCapabilities } from "@/src/modules/partner-cabinet/services/workspace-capability.service";

describe("Installation workspace navigation",()=>{
  it("exposes the two canonical installation views through Marketplace permission",()=>{
    const authorized=resolveWorkspaceCapabilities(new Set(["installation_marketplace.manage"]));
    expect(authorized.navigation.filter((item)=>item.key.startsWith("installation_"))).toEqual([
      expect.objectContaining({key:"installation_marketplace",href:"/cabinet/installation-marketplace?view=overview",label:"Статус монтажей"}),
      expect.objectContaining({key:"installation_profile",href:"/cabinet/installation-marketplace?view=profile",label:"Профиль инсталлятора"}),
    ]);
    expect(authorized.navigation.some((item)=>item.href==="/cabinet/installation-orders")).toBe(false);
    expect(resolveWorkspaceCapabilities(new Set()).navigation.some((item)=>item.key.startsWith("installation_"))).toBe(false);
  });
});
