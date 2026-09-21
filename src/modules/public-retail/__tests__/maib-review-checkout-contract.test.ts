import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (value: string) => fs.readFileSync(path.join(process.cwd(), value), "utf8");
const migration = read("supabase/migrations/20260921184500_maib_review_checkout_v1.sql");
const callbackMigration = read("supabase/migrations/20260921191500_maib_review_callback_channel_binding.sql");
const entryAction = read("app/maib-review/actions.ts");
const entryPage = read("app/maib-review/page.tsx");
const checkoutAction = read("src/modules/public-retail/actions/retail-checkout.actions.ts");
const paymentAction = read("src/modules/public-retail/actions/retail-payment.actions.ts");
const checkoutForm = read("src/modules/public-retail/components/PublicRetailCheckoutForm.tsx");
const paymentButton = read("src/modules/public-retail/components/PublicRetailPaymentButton.tsx");
const paymentServer = read("src/modules/payments/server.ts");
const callbackRoute = read("app/api/payments/maib/callback/route.ts");

describe("MAIB website review checkout contract", () => {
  it("uses a POST server action and a bounded secure cookie without putting the credential in URLs", () => {
    expect(entryAction).toContain('"use server"');
    expect(entryAction).toContain("isMaibReviewAccessCodeValid");
    expect(entryAction).toContain("httpOnly: true");
    expect(entryAction).toContain('sameSite: "lax"');
    expect(entryAction).toContain('secure: process.env.NODE_ENV === "production"');
    expect(entryAction).not.toMatch(/redirect\([^\n]*accessCode/);
    expect(entryPage).toContain('type="password"');
    expect(entryPage).not.toContain("MAIB_REVIEW_ACCESS_SECRET");
  });

  it("tags the authoritative order and requires the same channel at payment claim", () => {
    expect(checkoutAction).toContain('checkoutAccess.source === "maib_review"');
    expect(checkoutAction).toContain('checkoutChannel === "public"');
    expect(paymentAction).toContain("canInitiateRetailPaymentForAccess");
    expect(migration).toContain("checkout_channel text not null");
    expect(migration).toContain("create function public.create_public_retail_order_v4");
    expect(migration).toContain("create function public.claim_retail_payment_attempt_v3");
    expect(migration).toContain("target_channel is distinct from p_checkout_channel");
    expect(callbackMigration).toContain("confirm_maib_retail_payment_callback_v2");
    expect(callbackMigration).toContain("target_channel is distinct from p_checkout_channel");
  });

  it("uses separate sandbox-only review provider credentials and binds callback authentication to the order channel", () => {
    expect(paymentServer).toContain("MAIB_REVIEW_PAYMENT_MODE");
    expect(paymentServer).toContain("MAIB_REVIEW_CLIENT_ID");
    expect(paymentServer).toContain("MAIB_REVIEW_CLIENT_SECRET");
    expect(paymentServer).toContain("MAIB_REVIEW_SIGNATURE_KEY");
    expect(paymentServer).toContain("MAIB_REVIEW_API_BASE_URL");
    expect(callbackRoute).toContain('checkoutChannel = publicAuthentication.valid ? "public"');
    expect(callbackRoute).toContain("confirmMaibCallback(evidence, checkoutChannel)");
  });

  it("isolates review payment activation from fulfillment and customer provisioning", () => {
    expect(migration).toContain("if orders.checkout_channel = 'maib_review' then");
    expect(migration).toContain("'reviewIsolated', true");
    expect(migration.indexOf("if orders.checkout_channel = 'maib_review' then")).toBeLessThan(migration.indexOf("insert into public.installation_requirements"));
    expect(migration).toContain("orders.checkout_channel <> 'maib_review'");
    expect(checkoutAction).toContain('verifiedOwner && checkoutChannel === "public"');
  });

  it("shows governed receiving, payment, and complete legal presentation", () => {
    expect(checkoutForm).toContain("Согласованная доставка");
    expect(checkoutForm).toContain("Livrare coordonată");
    expect(checkoutForm).toContain("Банковская карта");
    expect(checkoutForm).toContain("MAIB Checkout");
    for (const route of ["/terms", "/privacy", "/delivery", "/returns", "/contacts"]) {
      expect(checkoutForm).toContain(route);
      expect(paymentButton).toContain(route);
    }
    expect(checkoutForm).toContain('name="legalAccepted" required type="checkbox"');
    expect(checkoutForm).toContain("Данные карты вводятся только на странице MAIB");
  });
});
