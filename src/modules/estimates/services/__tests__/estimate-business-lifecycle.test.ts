import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260809007000_estimate_business_lifecycle.sql"), "utf8");
const workflow = readFileSync(resolve("src/modules/estimates/components/EstimateWorkflowPanel.tsx"), "utf8");
const repository = readFileSync(resolve("src/modules/estimates/repositories/supabase/lifecycle.supabase-repository.ts"), "utf8");

describe("estimate business lifecycle", () => {
  it("stores canonical current state separately from archive governance", () => {
    expect(migration).toContain("lifecycle_status text not null default 'draft'");
    expect(migration).toContain("'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order'");
    expect(migration).not.toMatch(/alter table public\.estimates[\s\S]{0,120}drop column[^;]*status/i);
    expect(migration).toContain("record_estimate_lifecycle_creation");
  });

  it("enforces the explicit state machine and immutable events", () => {
    expect(migration).toContain("previous_status = 'draft' and target_status = 'sent'");
    expect(migration).toContain("previous_status = 'sent' and target_status in ('accepted', 'rejected', 'expired')");
    expect(migration).toContain("previous_status = 'accepted' and target_status = 'converted_to_order'");
    expect(migration).toContain("target_event_source = 'version_restore'");
    expect(migration).toContain("before update or delete on public.estimate_lifecycle_events");
    expect(migration).not.toContain("preview_opened");
  });

  it("uses governed version actions and rejection taxonomy", () => {
    expect(repository).toContain('versionRpc("transition_estimate_version_v2"');
    for (const reason of ["price", "no_budget", "other_supplier", "project_changed", "postponed", "other"]) {
      expect(migration).toContain(`'${reason}'`);
    }
    expect(workflow).toContain("Отправлено заказчику");
    expect(workflow).toContain("Принято заказчиком");
    expect(workflow).toContain("Причина отклонения");
  });

  it("derives order conversion only from confirmed order snapshots", () => {
    expect(migration).toContain("sync_confirmed_order_estimate_lifecycle");
    expect(migration).toContain("partner_order.integration_status = 'confirmed'");
    expect(migration).toContain("estimate.accepted_version_id = version.id");
    expect(migration).toContain("jsonb_array_elements(version.snapshot -> 'items')");
    expect(migration).toContain("order_item.quantity >= expected.quantity");
    expect(workflow).not.toContain('eventName: "proposal_converted_to_order"');
  });

  it("expires sent estimates in a bounded server-only worker", () => {
    expect(migration).toContain("function public.expire_estimate_lifecycles(target_limit integer default 100)");
    expect(migration).toContain("limit target_limit for update skip locked");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("grant execute on function public.expire_estimate_lifecycles(integer) to service_role");
  });

  it("keeps lifecycle reads company-scoped without direct writes", () => {
    expect(migration).toContain("public.can_access_estimates(company_id, 'estimates.view')");
    expect(migration).toContain("revoke all on table public.estimate_lifecycle_events from public, anon, authenticated");
    expect(migration).toContain("grant select on table public.estimate_lifecycle_events to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*estimate_lifecycle_events/i);
  });
});
