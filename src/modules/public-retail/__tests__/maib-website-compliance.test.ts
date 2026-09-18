import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { legalDocuments, PUBLIC_PRIVACY_VERSION, PUBLIC_TERMS_VERSION, publicMerchantLegalProfile, publicPaymentBranding } from "../legal/public-legal-content";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("MAIB website compliance boundary", () => {
  it("publishes stable RU/RO legal sources without inventing missing merchant identity", () => {
    expect(PUBLIC_TERMS_VERSION).toBe("2026-09-18");
    expect(PUBLIC_PRIVACY_VERSION).toBe("2026-09-18");
    for (const kind of ["terms", "privacy", "delivery", "returns"] as const) {
      expect(legalDocuments[kind].ru.sections.length).toBeGreaterThan(2);
      expect(legalDocuments[kind].ro.sections.length).toBe(legalDocuments[kind].ru.sections.length);
    }
    expect(publicMerchantLegalProfile).toMatchObject({ legalName: null, idno: null, registeredAddress: null });
  });

  it("keeps official payment marks and every legal route in the shared public footer", () => {
    const footer = read("src/modules/public-retail/components/PublicRetailShell.tsx");
    for (const route of ["/terms", "/privacy", "/delivery", "/returns", "/contacts"]) expect(footer).toContain(route);
    expect(footer).toContain("/payment/official/maib.png");
    expect(publicPaymentBranding.supportedInternationalPaymentSystems).toEqual([]);
    expect(publicPaymentBranding.maibLiberApplicable).toBe("UNKNOWN");
    expect(footer).not.toContain("maib-liber");
  });

  it("fails payment closed without current legal evidence/email and binds return details to a token", () => {
    const sql = read("supabase/migrations/20260918051644_maib_website_compliance_readiness_v1.sql");
    expect(sql).toContain("create table public.retail_legal_acceptances");
    expect(sql).toContain("Retail legal acceptances are append-only");
    expect(sql).toContain("'TERMS_NOT_ACCEPTED'");
    expect(sql).toContain("'EMAIL_REQUIRED'");
    expect(sql).toContain("create table public.retail_payment_return_tokens");
    expect(sql).toContain("get_retail_payment_return_state_v2(p_payment_attempt_id uuid,p_return_access_token_hash text)");
    expect(sql).toContain("token.token_hash=p_return_access_token_hash");
    expect(sql).toContain("persist_retail_payment_confirmation_email_v1");
    expect(sql).toContain("on conflict(delivery_identity,channel_mode) do nothing");
  });
});
