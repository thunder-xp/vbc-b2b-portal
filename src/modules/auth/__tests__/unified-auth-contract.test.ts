import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Unified Auth foundation route contract", () => {
  it("makes the canonical Auth entry phone-first and keeps classic Business login as fallback", () => {
    expect(read("app/auth/page.tsx")).toContain("/auth/customer?lang=");
    const customer = read("src/modules/auth/components/CustomerAuthEntry.tsx");
    expect(customer).toContain("<QuickAuthCard");
    const experience = read("src/modules/auth/components/BusinessSignInExperience.tsx");
    expect(experience).toContain("<SignInForm");
    expect(experience).toContain('href={`/auth/customer?lang=${locale}`}');
  });

  it("routes verified Quick Auth OTP through existing Customer and Business resolvers", () => {
    const customer = read("src/modules/auth/components/CustomerAuthEntry.tsx");
    expect(customer).toContain("QuickAuthCard");
    const actions = read("src/modules/quick-auth/actions.ts");
    expect(actions).toContain("resolveCustomerAccessForUser");
    expect(actions).toContain("createBusinessAccessResolver");
    expect(actions).toContain("/auth/select-access?lang=");
  });

  it("enables Business quick auth only for enrolled same-user Auth phones", () => {
    const factory = read("src/modules/quick-auth/factory.ts");
    const gateway = read("src/modules/quick-auth/supabase.repository.ts");
    const enrollment = read("src/modules/quick-auth/enrollment.supabase.ts");
    expect(factory).toContain('process.env.BUSINESS_PHONE_OTP_ENABLED !== "false"');
    expect(gateway).toContain("shouldCreateUser: false");
    expect(enrollment).toContain("auth.updateUser({ phone: phoneE164 })");
    expect(enrollment).toContain('isPhoneChange ? "phone_change" : "sms"');
    expect(enrollment).toContain("shouldCreateUser: false");
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
