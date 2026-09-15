import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { customerServiceNotificationPolicy } from "../notification-policy";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260915072023_final_customer_service_lifecycle_v1.sql"), "utf8");

describe("Final Customer service lifecycle migration", () => {
  it("separates customer-visible and internal communication under forced RLS", () => {
    expect(sql).toContain("create table public.customer_service_messages");
    expect(sql).toContain("visibility = 'CUSTOMER_VISIBLE'");
    expect(sql).toContain("event_type not in ('INTERNAL_NOTE_ADDED','INTERNAL_ATTACHMENT_ADDED')");
    expect(sql.match(/force row level security/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("governs transitions and requires an explanation for NEED_INFO", () => {
    expect(sql).toContain("NEED_INFO requires a customer-visible explanation");
    expect(sql).toContain("request_row.status = 'ACCEPTED' and next_status in ('RESOLVED','CANCELLED')");
    expect(sql).toContain("request_row.status in ('CLOSED','CANCELLED')");
    expect(sql).toContain("Customer service lifecycle is complete.");
    expect(sql).toContain("revoke execute on function public.update_customer_service_request_status_v1");
    expect(sql).not.toContain("request_row.status = 'RESOLVED' and next_status = 'IN_REVIEW'");
  });
  it("creates idempotent, customer-owned in-app notifications", () => {
    expect(sql).toContain("semantic_identity text not null unique");
    expect(sql).toContain("on conflict (semantic_identity) do nothing");
    expect(sql).toContain("customer_service_notifications_select_own");
  });
  it("keeps customer-service SMS disabled unless independently activated", () => {
    expect(customerServiceNotificationPolicy({ CUSTOMER_SERVICE_SMS_ENABLED: "false", CUSTOMER_SERVICE_SMS_MODE: "LIVE" }).sms).toBe("DISABLED");
    expect(customerServiceNotificationPolicy({ CUSTOMER_SERVICE_SMS_ENABLED: "true", CUSTOMER_SERVICE_SMS_MODE: "SANDBOX" }).sms).toBe("SANDBOX");
  });
});
