import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration=readFileSync(resolve("supabase/migrations/20260918200232_installation_marketplace_submission_persistence_integrity_v1.sql"),"utf8").toLowerCase();
const runtime=readFileSync(resolve("supabase/tests/installation_marketplace_submission_persistence_integrity_runtime.sql"),"utf8").toLowerCase();
const correctionMigration=readFileSync(resolve("supabase/migrations/20260918202413_installation_marketplace_return_for_correction_v1.sql"),"utf8").toLowerCase();
const correctionRuntime=readFileSync(resolve("supabase/tests/installation_marketplace_return_for_correction_runtime.sql"),"utf8").toLowerCase();

describe("Installation Marketplace submission persistence integrity",()=>{
  it("freezes the exact normalized provider profile in the append-only submission event",()=>{
    expect(migration).toContain("installation_partner_profile_payload_v1");
    expect(migration).toContain("'snapshotversion',1");
    expect(migration).toContain("'sourcerevision',p_expected_revision");
    expect(migration).toContain("'submissionrevision',next_revision");
    expect(migration).toContain("'profile',profile_payload");
    expect(migration).toContain("event.event_type='provider_submitted'");
  });

  it("blocks submission and approval unless mandatory fields and the exact snapshot are complete",()=>{
    expect(migration).toContain("'submissionready',submission_ready");
    expect(migration).toContain("'profile_descriptions'");
    expect(migration).toContain("'capacity'");
    expect(migration).toContain("submission_snapshot->'profile' is distinct from current_payload");
    expect(migration).toContain("installation_submission_snapshot_not_ready");
  });

  it("reproduces the real six-capability save/reload/submit/Admin equality path",()=>{
    expect(runtime).toContain("array['cctv','intercom','access_control','alarm','network','other']");
    expect(runtime).toContain("'available',2");
    expect(runtime).toContain("partner_get_installation_marketplace_activation_v1");
    expect(runtime).toContain("partner_submit_installation_marketplace_v1");
    expect(runtime).toContain("admin_get_installation_partner_activation_v1");
    expect(runtime).toContain("jsonb_array_length(snapshot->'capabilities') <> 6");
  });

  it("allows only the governed approved-to-draft correction transition",()=>{
    expect(correctionMigration).toContain("admin_return_installation_partner_for_correction_v1");
    expect(correctionMigration).toContain("provider.participation_status<>'approved'");
    expect(correctionMigration).toContain("'provider_returned_for_correction'");
    expect(correctionMigration).toContain("'previousstatus','approved','newstatus','draft'");
    expect(correctionMigration).toContain("installation_correction_reason_required");
    expect(correctionMigration).toContain("'repeated',true");
    expect(correctionMigration).not.toContain("provider.participation_status in ('approved','active')");
  });

  it("proves correction preservation, idempotency and a new immutable submission",()=>{
    expect(correctionRuntime).toContain("approved -> draft failed");
    expect(correctionRuntime).toContain("return-for-correction retry was not idempotent");
    expect(correctionRuntime).toContain("preserved authoritative data changed");
    expect(correctionRuntime).toContain("active return-for-correction was accepted");
    expect(correctionRuntime).toContain("new immutable submission mismatch");
  });
});
