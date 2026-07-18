import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260718100000_proposal_delivery_foundation.sql"), "utf8");
const rateLimitSql = readFileSync(resolve("supabase/migrations/20260718104000_proposal_delivery_recipient_rate_limit.sql"), "utf8");

describe("proposal delivery migration", () => {
  it("stores only hashed tokens behind RLS without anonymous table access", () => {
    expect(sql).toContain("token_hash text not null");
    expect(sql).not.toMatch(/\braw_token\b/i);
    expect(sql).toContain("alter table public.estimate_proposal_deliveries enable row level security");
    expect(sql).toContain("revoke all on table public.estimate_proposal_deliveries, public.estimate_proposal_delivery_attempts from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*estimate_proposal_deliveries.*authenticated/i);
  });

  it("keeps public token operations service-role-only and bounded", () => {
    expect(sql).toContain("grant execute on function public.get_public_proposal_delivery(text) to service_role");
    expect(sql).toContain("grant execute on function public.track_public_proposal_open(text) to service_role");
    expect(sql).toContain("grant execute on function public.submit_public_proposal_response(text, text, text, text) to service_role");
    expect(sql).toContain("last_opened_at < now() - interval '5 minutes'");
    expect(sql).toContain("open_count = least(1000, open_count + 1)");
  });

  it("applies customer response and estimate version status in one transaction", () => {
    expect(sql).toContain("from public.apply_estimate_version_final_response(delivery.version_id, target_response, target_response_note, null)");
    expect(sql).toContain("if current_version.status <> 'sent'");
    expect(sql).toContain("if delivery.response <> target_response");
    expect(sql).toContain("update public.estimates set accepted_version_id = current_version.id");
  });

  it("supports explicit resend without mutating the immutable version or PDF", () => {
    expect(sql).toContain("version.status not in ('prepared', 'sent')");
    expect(sql).toContain("document.status = 'ready'");
    expect(sql).toContain("unique(company_id, idempotency_key)");
  });

  it("rate limits by company user and by exact version recipient", () => {
    expect(sql).toContain("Delivery rate limit exceeded");
    expect(rateLimitSql).toContain("d.version_id = version.id");
    expect(rateLimitSql).toContain("d.recipient_email = lower(btrim(target_recipient_email))");
    expect(rateLimitSql).toContain("Recipient delivery rate limit exceeded");
  });
});
