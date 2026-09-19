import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Customer and Agent operational detail UX", () => {
  it("keeps customer order and payment states distinct with one empty-state action", () => {
    const list = read("app/account/(private)/orders/page.tsx");
    const detail = read("app/account/(private)/orders/[orderId]/page.tsx");
    expect(list).toContain("orderStatus(order.status, locale)");
    expect(list).toContain("paymentStatus(order.paymentState, locale)");
    expect(list).toContain("showService={false}");
    expect(list).toContain("previewImageUrl");
    expect(detail.indexOf("Текущее состояние")).toBeLessThan(detail.indexOf("Товары"));
    expect(detail.indexOf("Товары")).toBeLessThan(detail.indexOf("Документы"));
    expect(detail).not.toMatch(/providerPaymentId|checkoutId|rrn/i);
  });

  it("renders service as a customer-visible conversation inbox", () => {
    const list = read("app/account/(private)/service/page.tsx");
    const detail = read("app/account/(private)/service/[requestId]/page.tsx");
    expect(list).toContain("latestMessage");
    expect(list).toContain('request.status === "NEED_INFO"');
    expect(detail.indexOf("Переписка")).toBeLessThan(detail.indexOf("Исходное обращение"));
    expect(detail.indexOf("CustomerServiceReplyForm")).toBeLessThan(detail.indexOf("Исходное обращение"));
    expect(detail).not.toContain("INTERNAL_NOTE");
  });

  it("uses localized, factual Agent referral and attribution workspaces without finance", () => {
    const paths = ["app/(agent)/agent/referrals/page.tsx", "app/(agent)/agent/referrals/[id]/page.tsx", "app/(agent)/agent/clients/page.tsx", "app/(agent)/agent/clients/[id]/page.tsx"];
    for (const path of paths) {
      const source = read(path);
      expect(source).toContain("getAgentCabinetLocale");
      expect(source).not.toMatch(/commission|payout|margin|revenue/i);
    }
    expect(read(paths[0])).toContain("lastEventType");
    expect(read(paths[1])).toContain("OperationalTimeline");
    expect(read(paths[2])).toContain("maskedContact");
    expect(read(paths[3])).toContain("referralId");
  });

  it("keeps controlled acceptance identities local and production migrations data-free", () => {
    const fixture = read("supabase/tests/customer_agent_cabinet_experience_fixture.sql");
    const migration = read("supabase/migrations/20260919095336_customer_agent_operational_detail_ux_v2.sql");
    expect(fixture).toContain("test.customer.novotech@example.test");
    expect(migration).not.toContain("example.test");
    expect(migration).not.toMatch(/insert into public\.(customer_service|agent_)/i);
  });
});
