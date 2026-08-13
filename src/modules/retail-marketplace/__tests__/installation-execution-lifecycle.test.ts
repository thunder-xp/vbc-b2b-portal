import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { RetailMarketplaceRepository } from "../repositories/retail-marketplace.repository";
import { InstallationAssignmentDispatcher, InstallationAssignmentInputError } from "../services/installation-assignment.service";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260813091615_retail_installation_execution_lifecycle.sql"), "utf8");
const partnerPage = fs.readFileSync(path.resolve("app/(partner)/cabinet/installation-orders/page.tsx"), "utf8");
const customerPage = fs.readFileSync(path.resolve("app/order/[token]/page.tsx"), "utf8");
const adminPage = fs.readFileSync(path.resolve("app/(admin)/admin/retail/installation/page.tsx"), "utf8");
const id = (digit: number) => `${digit}0000000-0000-4000-8000-00000000000${digit}`;
function repository(): RetailMarketplaceRepository { return { getCurrentTariffs: vi.fn(), listPublicProviders: vi.fn(), getAdminReport: vi.fn(), saveTariffDraft: vi.fn(), publishTariff: vi.fn(), saveProvider: vi.fn(), activatePilot: vi.fn(), dispatch: vi.fn(), listPartnerAssignments: vi.fn(), respondToAssignment: vi.fn(), transitionPartnerExecution: vi.fn().mockResolvedValue({ executionId: id(2), state: "scheduled", revision: 1, repeated: false, scheduledStartAt: "2026-08-20T07:00:00Z", scheduledEndAt: null }), transitionAdminExecution: vi.fn(), getAssignmentAdminReport: vi.fn(), reassign: vi.fn(), runAssignmentWorker: vi.fn() }; }

describe("Installation execution lifecycle", () => {
  it("defines the bounded state machine and cancellation boundary", () => {
    for (const state of ["scheduling", "scheduled", "in_progress", "completed_by_provider", "customer_confirmation_pending", "customer_confirmed", "issue_reported", "disputed", "resolved", "cancelled"]) expect(sql).toContain(`'${state}'`);
    expect(sql).toContain("execution.state not in ('scheduling','scheduled')");
    expect(sql).not.toMatch(/create_.*payment|maib_|one_c_|1c_/i);
  });

  it("serializes transitions and protects idempotency and capacity release", () => {
    expect(sql).toContain("where id=p_execution_id for update");
    expect(sql).toContain("unique(execution_id,idempotency_key)");
    expect(sql).toContain("execution.revision<>p_expected_revision");
    expect(sql).toContain("active_jobs=greatest(active_jobs-1,0)");
    expect(sql).toContain("capacity_released_at=now()");
  });

  it("keeps events append-only and ownership immutable", () => {
    expect(sql).toContain("create table public.installation_execution_events");
    expect(sql).toContain("Installation execution history is immutable.");
    expect(sql).toContain("Installation execution ownership is immutable.");
    expect(sql).toContain("settlement_eligibility_reached");
    expect(sql).toContain("installation_execution_events_actor_idx");
  });

  it("uses the order token relationship without exposing a customer id", () => {
    const customer = sql.slice(sql.indexOf("create or replace function public.customer_transition_installation_execution"), sql.indexOf("create or replace function public.partner_list_installation_assignments"));
    expect(customer).toContain("token.token_hash=p_access_token_hash");
    expect(customer).toContain("requirement.retail_order_id=token.order_id");
    expect(customer).not.toContain("customer_id");
  });

  it("leaves automatic confirmation disabled", () => {
    expect(sql).toContain("customer_confirmation_timeout_hours");
    expect(sql).toContain("values('cctv',null,false)");
    expect(sql).not.toContain("cron.schedule");
  });

  it("keeps partner, customer, and internal operations on the same governed aggregate", () => {
    expect(partnerPage).toContain("transitionPartnerInstallationExecutionAction");
    expect(partnerPage).toContain("Назначить дату");
    expect(partnerPage).toContain("Начать работы");
    expect(partnerPage).toContain("Завершить работы");
    expect(customerPage).toContain("respondToInstallationCompletionAction");
    expect(customerPage).toContain("Подтвердить выполнение");
    expect(customerPage).toContain("Есть проблема");
    expect(adminPage).toContain("Ожидает заказчика");
    expect(adminPage).toContain("Проблемы и споры");
  });

  it("redacts provider and customer projections and keeps execution independent", () => {
    expect(sql).toContain("'customerInstallationCharge',null,'providerPayable',null");
    expect(sql).toContain("'email',null");
    expect(sql).not.toMatch(/paymentprovider|create_payment|maib_|one_c_|retail_order_export/i);
    expect(customerPage).not.toMatch(/providerId|partnerCompanyId|activeJobs|rankingScore|assignmentAttempt/i);
  });

  it("validates partner commands before repository orchestration", async () => {
    const repo = repository(); const service = new InstallationAssignmentDispatcher(repo);
    await service.transitionPartner({ companyId: id(1), executionId: id(2), command: "schedule", expectedRevision: 0, scheduledStartAt: "2026-08-20T10:00", idempotencyKey: id(3) });
    expect(repo.transitionPartnerExecution).toHaveBeenCalledWith(expect.objectContaining({ command: "schedule", expectedRevision: 0 }));
    expect(() => service.transitionPartner({ companyId: id(1), executionId: id(2), command: "schedule", expectedRevision: 0, scheduledStartAt: "bad", idempotencyKey: id(3) })).toThrow(InstallationAssignmentInputError);
  });
});
