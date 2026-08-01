import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const queuePage = read("app/(admin)/admin/onboarding/page.tsx");
const detailPage = read("app/(admin)/admin/onboarding/[requestId]/page.tsx");
const loading = read("app/(admin)/admin/onboarding/loading.tsx");
const queueView = read("src/modules/onboarding/components/OnboardingQueueView.tsx");
const detailView = read("src/modules/onboarding/components/OnboardingDetailView.tsx");
const pendingIndicator = read("src/modules/onboarding/components/OnboardingLinkPendingIndicator.tsx");
const repository = read("src/modules/onboarding/repositories/supabase-onboarding.repository.ts");
const actions = read("src/modules/onboarding/actions/onboarding.actions.ts");
const adminContext = read("src/modules/admin/services/admin-workspace.service.ts");
const foundation = read("supabase/migrations/20260731120000_partner_onboarding_console_foundation.sql");

describe("onboarding rendering performance", () => {
  it("disables automatic prefetch for bounded queue and detail navigation", () => {
    expect(queuePage).toContain('href="/admin/onboarding/health"');
    expect(queuePage).toContain("prefetch={false}");
    expect(queueView.match(/prefetch=\{false\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(detailView).toContain('href="/admin/onboarding" prefetch={false}');
  });

  it("provides immediate route-level loading feedback", () => {
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-label="Загрузка онбординга"');
    expect(pendingIndicator).toContain("useLinkStatus");
    expect(pendingIndicator).toContain('aria-label={pending ? "Открытие заявки"');
  });

  it("does not render mutable client islands for an approved request", () => {
    expect(detailView).toContain("terminal ? (");
    expect(detailView).toContain("<TerminalResult");
    expect(detailView).toContain("canRenderDecisionForms");
    expect(detailView).toContain('["rejected", "cancelled"]');
  });

  it("serializes compact client-island DTOs", () => {
    expect(detailView).toContain("request: { id: detail.request.id, status: detail.request.status }");
    expect(detailView).not.toContain("<OnboardingApprovalWizard detail={detail}");
    expect(detailView).not.toContain("<OnboardingDecisionForms detail={detail}");
  });
});

describe("onboarding server read performance", () => {
  it("keeps one queue RPC and one detail RPC", () => {
    expect(repository.match(/client\.rpc\("get_onboarding_queue_v2"/g)).toHaveLength(1);
    expect(repository.match(/client\.rpc\("get_onboarding_request_detail_v4"/g)).toHaveLength(1);
  });

  it("records access, aggregate, and total server stages without extra reads", () => {
    expect(actions).toContain('"onboarding_queue", "access_context"');
    expect(actions).toContain('"onboarding_queue", "queue_rpc"');
    expect(actions).toContain('emitRequestTotal("onboarding_queue")');
    expect(actions).toContain('"onboarding_detail", "detail_rpc"');
    expect(actions).toContain('emitRequestTotal("onboarding_detail")');
  });

  it("uses one request-scoped access context", () => {
    expect(adminContext).toContain("cache(");
    expect(queuePage).toContain('requireAdminPagePermission("onboarding.requests.view")');
    expect(detailPage).toContain('requireAdminPagePermission("onboarding.requests.view")');
  });

  it("does not perform render-time 1C reads", () => {
    expect(queuePage).not.toMatch(/OneC|one-c|getOneCEnv/);
    expect(detailPage).not.toMatch(/OneC|one-c|getOneCEnv/);
    expect(repository.slice(0, repository.indexOf("async assign"))).not.toMatch(
      /getOneCEnv|OneCCounterpartyDirectorySource|fetch\(/,
    );
  });

  it("keeps focused mutation revalidation", () => {
    expect(actions).toContain('revalidatePath("/admin/onboarding")');
    expect(actions).toMatch(/revalidatePath.*admin\/onboarding\/.*requestId/);
    expect(actions).not.toContain('revalidatePath("/admin")');
  });

  it("retains bounded queue, revision, assignment, and timeline indexes", () => {
    expect(foundation).toContain("access_requests_onboarding_queue_idx");
    expect(foundation).toContain("access_requests_assigned_manager_idx");
    expect(foundation).toContain("onboarding_revisions_request_idx");
    expect(foundation).toContain("onboarding_events_request_idx");
  });
});
