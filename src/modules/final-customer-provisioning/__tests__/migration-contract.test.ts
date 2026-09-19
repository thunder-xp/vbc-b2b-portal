import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260919201121_final_customer_first_purchase_provisioning_v1.sql",
), "utf8");

describe("first-purchase Final Customer provisioning migration", () => {
  it("stores immutable verified order ownership without granting browser table access", () => {
    expect(migration).toContain("create table public.retail_order_auth_bindings");
    expect(migration).toContain("auth_user_id uuid not null references auth.users");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("v_customer.phone <> v_phone");
    expect(migration).toContain("prevent_retail_order_auth_binding_mutation");
    expect(migration).not.toContain("grant select, insert on table public.retail_order_auth_bindings to authenticated");
  });

  it("emits one provider-neutral purchase event only from paid activation", () => {
    expect(migration).toContain("event_type text not null default 'FIRST_PURCHASE_CONFIRMED'");
    expect(migration).toContain("unique references public.retail_payment_activations");
    expect(migration).toContain("perform private.enqueue_first_purchase_confirmed(orders.id, existing.id)");
    expect(migration).toContain("perform private.enqueue_first_purchase_confirmed(orders.id, activation_id)");
    expect(migration).not.toContain("maib_callback");
  });

  it("uses locks and uniqueness for retry and concurrent processing", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("retail_order_id uuid not null unique");
    expect(migration).toContain("where auth_user_id = v_binding.auth_user_id for update");
    expect(migration).toContain("on conflict (retail_order_id) do nothing");
  });

  it("keeps 1C work asynchronous and protects ambiguous identity history", () => {
    expect(migration).toContain("create table public.customer_external_provisioning_jobs");
    expect(migration).toContain("'PENDING', 'PROCESSING', 'MATCHED', 'NEW', 'AMBIGUOUS', 'CONFLICT', 'FAILED_RETRYABLE'");
    expect(migration).toContain("then 'PENDING' else 'AWAITING_OWNER' end");
    expect(migration).toContain("IDENTITY_CONFLICT");
    expect(migration).toContain("IDENTITY_ALREADY_ENTITLED");
    expect(migration).not.toMatch(/http|odata|onec_provider/i);
  });

  it("preserves legal evidence and grants mutation RPCs only to governed principals", () => {
    expect(migration).not.toContain("retail_legal_acceptances");
    expect(migration).toContain("grant execute on function public.bind_retail_order_authenticated_owner_v1");
    expect(migration).toContain("bind_retail_order_authenticated_owner_v1(text, uuid, text, integer)");
    expect(migration).toContain("grant execute on function public.claim_customer_provisioning_events_v1");
    expect(migration).toContain("to service_role");
  });
});
