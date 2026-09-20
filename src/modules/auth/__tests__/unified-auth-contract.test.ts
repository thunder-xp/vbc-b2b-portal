import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Unified Auth foundation route contract", () => {
  it("keeps one canonical Auth Center with explicit Business and Customer entries", () => {
    expect(read("app/auth/page.tsx")).toContain("UnifiedAuthCenter");
    const center = read("src/modules/auth/components/UnifiedAuthCenter.tsx");
    expect(center).toContain("<BusinessSignInExperience");
    const experience = read("src/modules/auth/components/BusinessSignInExperience.tsx");
    expect(experience).toContain("<SignInForm");
    expect(experience).toContain('href={`/auth/customer?lang=${locale}`}');
  });

  it("reuses PhoneOtpForm and routes verified OTP through the read-only resolver completion", () => {
    const customer = read("src/modules/auth/components/CustomerAuthEntry.tsx");
    expect(customer).toContain("PhoneOtpForm");
    expect(customer).toContain('successPath="/auth/customer/complete"');
    expect(read("app/auth/customer/complete/page.tsx")).toContain("resolveCurrentCustomerAccess");
  });

  it("keeps legacy customer entry recoverable behind the unified gate", () => {
    const legacy = read("app/account/sign-in/page.tsx");
    expect(legacy).toContain("isUnifiedAuthCenterEnabled");
    expect(legacy).toContain('redirect("/auth/customer")');
    expect(legacy).toContain("<PhoneOtpForm");
  });

  it("keeps Partner and Agent guards unchanged while enforcing read-only customer entitlement", () => {
    expect(read("app/(partner)/cabinet/layout.tsx")).toContain("getPartnerWorkspaceContextAction");
    expect(read("app/(agent)/agent/layout.tsx")).toContain("getAgentCabinetContext");
    expect(read("src/modules/final-customer/server.ts")).toContain("resolveCustomerAccessForUser(user.id)");
    expect(read("src/modules/final-customer/server.ts")).not.toContain("ensureAccount");
    expect(read("src/modules/final-customer/repository.ts")).not.toContain("createAccount");
  });
});
