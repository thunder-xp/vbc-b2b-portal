import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { RetailMarketplaceRepository } from "../repositories/retail-marketplace.repository";
import { InstallationAssignmentDispatcher, InstallationAssignmentInputError } from "../services/installation-assignment.service";

const migration = fs.readFileSync(path.resolve("supabase/migrations/20260813090352_retail_installation_assignment_engine.sql"), "utf8");
const ids = {
  requirement: "10000000-0000-4000-8000-000000000001",
  attempt: "20000000-0000-4000-8000-000000000002",
  company: "30000000-0000-4000-8000-000000000003",
  request: "40000000-0000-4000-8000-000000000004",
};

function repository(): RetailMarketplaceRepository {
  return {
    getCurrentTariffs: vi.fn(), listPublicProviders: vi.fn(), getAdminReport: vi.fn(), saveTariffDraft: vi.fn(), publishTariff: vi.fn(), saveProvider: vi.fn(),
    activatePilot: vi.fn().mockResolvedValue({ requirementId: ids.requirement, status: "offered", attemptId: ids.attempt, repeated: false }), dispatch: vi.fn(), listPartnerAssignments: vi.fn().mockResolvedValue([]), respondToAssignment: vi.fn().mockResolvedValue({ attemptId: ids.attempt, status: "accepted", repeated: false }), transitionPartnerExecution: vi.fn(), transitionAdminExecution: vi.fn(), getAssignmentAdminReport: vi.fn(), reassign: vi.fn(), runAssignmentWorker: vi.fn(),
  };
}

describe("Installation Assignment Engine", () => {
  it("keeps requirement, attempts, execution and RetailOrder snapshots separate", () => {
    expect(migration).toContain("create table public.installation_requirements");
    expect(migration).toContain("create table public.installation_assignment_attempts");
    expect(migration).toContain("create table public.installation_executions");
    expect(migration).toContain("new.installation_work_lines_snapshot<>old.installation_work_lines_snapshot");
    expect(migration).not.toMatch(/update public\.retail_orders set status/);
  });

  it("guarantees one active offer and immutable terminal history", () => {
    expect(migration).toContain("installation_assignment_one_active_idx");
    expect(migration).toContain("where status='offered'");
    expect(migration).toContain("old.status<>'offered'");
    expect(migration).toContain("Installation assignment attempts are immutable after offer.");
  });

  it("uses deterministic local eligibility and ranking without fan-out", () => {
    expect(migration).toContain("order by geography_rank,workload_ratio,last_offered_at nulls first,id");
    expect(migration).toContain("capacity_available");
    expect(migration).toContain("not_terminally_attempted");
    expect(migration).not.toMatch(/http|fetch|1c|maib/i);
  });

  it("implements customer preference, automatic ranking and internal fallback", () => {
    expect(migration).toContain("requirement.selection_mode='customer_selected'");
    expect(migration).toContain("provider.provider_type='partner_company'");
    expect(migration).toContain("provider.provider_type='internal_team'");
    expect(migration).toContain("'assignment_unavailable'");
  });

  it("serializes accept, decline, timeout and reassignment", () => {
    expect(migration).toContain("where id=p_attempt_id for update");
    expect(migration).toContain("where id=p_requirement_id for update");
    expect(migration).toContain("status='timed_out'");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("pg_try_advisory_xact_lock");
  });

  it("redacts PII until acceptance and omits unresolved compensation", () => {
    expect(migration).toContain("case when attempt.status='accepted' then requirement.customer_pii_snapshot else null end");
    expect(migration).toContain("'providerPayable',null");
    expect(migration).toContain("'customerInstallationCharge',null");
  });

  it("keeps pilot activation internal, audited and idempotent", () => {
    expect(migration).toContain("activate_installation_requirement_pilot");
    expect(migration).toContain("has_internal_permission('admin.retail_marketplace.manage')");
    expect(migration).toContain("'pilot_simulated'");
    expect(migration).toContain("retail_order_id uuid not null unique");
  });

  it("validates and delegates partner responses without accepting tenant ownership from UI", async () => {
    const repo = repository(); const service = new InstallationAssignmentDispatcher(repo);
    await service.respond({ companyId: ids.company, attemptId: ids.attempt, decision: "decline", reasonCode: "no_capacity", idempotencyKey: ids.request });
    expect(repo.respondToAssignment).toHaveBeenCalledWith(expect.objectContaining({ companyId: ids.company, decision: "decline", reasonCode: "no_capacity" }));
    expect(() => service.respond({ companyId: ids.company, attemptId: ids.attempt, decision: "decline", reasonCode: "guessed", idempotencyKey: ids.request })).toThrow(InstallationAssignmentInputError);
  });
});
