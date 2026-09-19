import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { customerAttentionCopy } from "../attention-copy";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260919163259_customer_agent_attention_return_loops_v4.sql");

describe("Customer and Agent attention return loops", () => {
  it("keeps read receipts separate from authoritative business state", () => {
    expect(migration).toContain("create table public.customer_account_attention_reads");
    expect(migration).toContain("create table public.agent_cabinet_attention_reads");
    expect(migration).not.toMatch(/update public\.(retail_orders|customer_service_requests|agent_referrals|agent_attributions)\s+set/i);
    expect(migration.match(/force row level security/g)).toHaveLength(2);
  });

  it("reuses service notifications and reads bounded authoritative payment facts", () => {
    expect(migration).toContain("from public.customer_service_notifications notification");
    expect(migration).toContain("from public.retail_payment_events event");
    expect(migration).toContain("attempt.status = 'failed'");
    expect(migration).toContain("from public.retail_payment_refund_events event");
    expect(migration).toContain("limit 3");
    expect(migration).not.toMatch(/cron|http_request|notification_deliver/i);
  });

  it("keeps visible Agent attention out of Activity and excludes commission claims", () => {
    expect(migration).toContain("not exists (select 1 from attention_rows attention where attention.id = event.id)");
    expect(migration).toContain("event.event_type <> 'REFERRAL_CAPTURED'");
    expect(migration).not.toMatch(/commission|payout|balance/i);
  });

  it("has complete human-facing RU and RO copy for every Customer event", () => {
    for (const eventCode of ["CUSTOMER_SERVICE_NEED_INFO", "CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH", "CUSTOMER_SERVICE_RESOLVED", "CUSTOMER_PAYMENT_PAID", "CUSTOMER_PAYMENT_FAILED", "CUSTOMER_PAYMENT_REFUNDED"] as const) {
      for (const locale of ["ru", "ro"] as const) {
        const copy = customerAttentionCopy({ priority: "IMPORTANT_UPDATE", sourceKind: "SERVICE_NOTIFICATION", sourceId: "id", eventCode, contextLabel: "R-1", createdAt: "now", actionPath: "/account" }, locale);
        expect(copy.title.length).toBeGreaterThan(3);
        expect(copy.action.length).toBeGreaterThan(3);
        expect(copy.detail).toContain("R-1");
      }
    }
  });

  it("uses server-owned deep links and compact accessible action controls", () => {
    const customerHome = read("app/account/(private)/page.tsx");
    const agentHome = read("app/(agent)/agent/page.tsx");
    const patterns = read("src/modules/cabinet-experience/components/CabinetPatterns.tsx");
    expect(customerHome).toContain("openFinalCustomerAttentionAction");
    expect(agentHome).toContain("openAgentAttentionAction");
    expect(patterns).toContain("min-h-16");
    expect(patterns).toContain('type="submit"');
    expect(`${customerHome}\n${agentHome}`).not.toContain("Комиссия начислена");
  });
});
