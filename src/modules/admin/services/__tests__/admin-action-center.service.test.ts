import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/modules/agent-application", () => ({ createCommercialAgentApplicationService: vi.fn() }));
vi.mock("@/src/modules/agent-commercial/service", () => ({ createAgentCommercialService: vi.fn() }));
vi.mock("@/src/modules/onboarding", () => ({ SupabaseOnboardingRepository: vi.fn() }));
vi.mock("@/src/modules/service-center", () => ({ createServiceCenterService: vi.fn() }));
vi.mock("../admin-operations.service", () => ({ createAdminOperationsService: vi.fn() }));

import type { CommercialAgentApplication } from "@/src/modules/agent-application";
import type { AgentRewardFinanceQueueItem } from "@/src/modules/agent-commercial/types";
import type { OnboardingQueue, OnboardingQueueRow } from "@/src/modules/onboarding";
import type { ServiceAdminAttentionItem } from "@/src/modules/service-center";

import type { AdminOperationalIssue } from "../../types";
import { AdminActionCenterService, type AdminActionCenterDependencies } from "../admin-action-center.service";

const NOW = new Date("2026-09-26T12:00:00.000Z");

function dependencies(overrides: Partial<AdminActionCenterDependencies> = {}): AdminActionCenterDependencies {
  return {
    listOperationalIssues: vi.fn(async () => []),
    listServiceAttention: vi.fn(async () => []),
    listOnboardingQueue: vi.fn(async () => queue([])),
    listAgentApplications: vi.fn(async () => []),
    listAgentRewardQueue: vi.fn(async () => []),
    ...overrides,
  };
}

describe("AdminActionCenterService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("projects supported domain states into human actions and canonical routes", async () => {
    const deps = dependencies({
      listOperationalIssues: vi.fn(async () => [operationalIssue()]),
      listServiceAttention: vi.fn(async () => [serviceItem()]),
      listOnboardingQueue: vi.fn(async (status) => queue([onboardingRow(status)])),
      listAgentApplications: vi.fn(async () => [
        agentApplication("SUBMITTED", "agent-submitted"),
        agentApplication("NEEDS_CLARIFICATION", "agent-waiting"),
      ]),
    });

    const center = await new AdminActionCenterService(deps).getActionCenter([
      "admin.dashboard.view",
      "admin.service.view",
      "onboarding.requests.view",
      "admin.agents.manage",
    ], NOW);

    expect(center.items.map(({ level }) => level)).toEqual([
      "CRITICAL", "ACTION_REQUIRED", "ACTION_REQUIRED", "ACTION_REQUIRED", "ACTION_REQUIRED", "WAITING",
    ]);
    expect(center.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Не завершена публикация цен", actionHref: "/admin/operations/issues/prices:run-1" }),
      expect.objectContaining({ title: "Новая заявка партнёра", actionHref: "/admin/onboarding/received-id" }),
      expect.objectContaining({ title: "Заявка партнёра готова к решению", actionHref: "/admin/onboarding/ready_for_approval-id" }),
      expect.objectContaining({ title: "Заявка коммерческого агента", actionHref: "/admin/agents/applications/agent-submitted" }),
      expect.objectContaining({ title: "Сервисное обращение требует решения", actionHref: "/admin/service/case-1" }),
    ]));
    expect(center.actionableCount).toBe(5);
    expect(center.waitingCount).toBe(1);
  });

  it("aggregates multiple signals for one entity and deterministically selects the strongest state", async () => {
    const signals = [
      serviceItem("new-event", "case-1", "service_case_new", "2026-08-08T10:00:00.000Z"),
      serviceItem("generic-event", "case-1", "service_case_unassigned", "2026-08-08T11:00:00.000Z"),
      serviceItem("overdue-event", "case-1", "service_case_overdue", "2026-09-26T10:00:00.000Z"),
    ];
    const first = await new AdminActionCenterService(dependencies({
      listServiceAttention: vi.fn(async () => signals),
    })).getActionCenter(["admin.service.view"], NOW);
    const reversed = await new AdminActionCenterService(dependencies({
      listServiceAttention: vi.fn(async () => [...signals].reverse()),
    })).getActionCenter(["admin.service.view"], NOW);

    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toEqual(expect.objectContaining({
      id: "service:request:case-1",
      situationKey: "service:request:case-1",
      signalCount: 3,
      title: "Сервисная заявка просрочена",
      explanation: "Срок обработки обращения истёк.",
      createdAt: "2026-08-08T10:00:00.000Z",
      actionHref: "/admin/service/case-1",
    }));
    expect(reversed.items).toEqual(first.items);
    expect(first.actionableCount).toBe(1);
  });

  it("keeps different domain entities as separate situations", async () => {
    const center = await new AdminActionCenterService(dependencies({
      listServiceAttention: vi.fn(async () => [
        serviceItem("event-1", "case-1", "service_case_new"),
        serviceItem("event-2", "case-2", "service_case_new"),
      ]),
    })).getActionCenter(["admin.service.view"], NOW);

    expect(center.items.map(({ situationKey }) => situationKey)).toEqual([
      "service:request:case-1",
      "service:request:case-2",
    ]);
    expect(center.actionableCount).toBe(2);
  });

  it("naturally removes a situation after its authoritative domain state resolves", async () => {
    let resolved = false;
    const deps = dependencies({
      listServiceAttention: vi.fn(async () =>
        resolved ? [] : [serviceItem("event-1", "case-1", "service_case_overdue")]
      ),
    });
    const service = new AdminActionCenterService(deps);

    expect((await service.getActionCenter(["admin.service.view"], NOW)).items)
      .toHaveLength(1);
    resolved = true;
    const center = await service.getActionCenter(["admin.service.view"], NOW);
    expect(center.items).toHaveLength(0);
    expect(center.actionableCount).toBe(0);
  });

  it("shows actionable Agent rewards only to Finance-authorized users and removes them after payout", async () => {
    let paid = false;
    const deps = dependencies({
      listAgentRewardQueue: vi.fn(async () => paid ? [] : [agentReward()]),
    });
    const service = new AdminActionCenterService(deps);

    const unauthorized = await service.getActionCenter(["admin.agents.view"], NOW);
    expect(unauthorized.items).toHaveLength(0);
    expect(deps.listAgentRewardQueue).not.toHaveBeenCalled();

    const actionable = await service.getActionCenter(["admin.agent_rewards.approve"], NOW);
    expect(actionable.items).toEqual([
      expect.objectContaining({
        domain: "finance",
        kind: "agent_reward_payout",
        title: "Вознаграждение агента готово к выплате",
        actionHref: "/admin/agents/rewards/reward-sale-link",
      }),
    ]);
    paid = true;
    expect((await service.getActionCenter(["admin.agent_rewards.approve"], NOW)).items).toHaveLength(0);
  });

  it("does not execute or expose unauthorized domain sources", async () => {
    const deps = dependencies({
      listOperationalIssues: vi.fn(async () => [operationalIssue()]),
      listServiceAttention: vi.fn(async () => [serviceItem()]),
      listOnboardingQueue: vi.fn(async () => queue([onboardingRow("received")])),
      listAgentApplications: vi.fn(async () => [agentApplication("SUBMITTED", "agent-1")]),
      listAgentRewardQueue: vi.fn(async () => [agentReward()]),
    });
    const center = await new AdminActionCenterService(deps).getActionCenter(["admin.dashboard.view"], NOW);
    expect(center.items).toHaveLength(1);
    expect(center.items[0]?.domain).toBe("integration");
    expect(deps.listServiceAttention).not.toHaveBeenCalled();
    expect(deps.listOnboardingQueue).not.toHaveBeenCalled();
    expect(deps.listAgentApplications).not.toHaveBeenCalled();
    expect(deps.listAgentRewardQueue).not.toHaveBeenCalled();
  });

  it("bounds each source and the initial mixed queue", async () => {
    const repeated = <T,>(factory: (index: number) => T) => Array.from({ length: 30 }, (_, index) => factory(index));
    const deps = dependencies({
      listOperationalIssues: vi.fn(async () => repeated((index) => operationalIssue(`run-${index}`))),
      listServiceAttention: vi.fn(async () => repeated((index) => serviceItem(`event-${index}`))),
      listOnboardingQueue: vi.fn(async () => queue(repeated((index) => onboardingRow("received", index)))),
      listAgentApplications: vi.fn(async () => repeated((index) => agentApplication("SUBMITTED", `agent-${index}`))),
    });
    const center = await new AdminActionCenterService(deps).getActionCenter([
      "admin.dashboard.view", "admin.service.view", "onboarding.requests.view", "admin.agents.manage",
    ], NOW);
    expect(center.items).toHaveLength(24);
    expect(center.hasMore).toBe(true);
    expect(center.items.filter(({ domain }) => domain === "integration")).toHaveLength(8);
  });

  it("keeps healthy sources visible and reports a bounded warning when one source fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = dependencies({
      listOperationalIssues: vi.fn(async () => [operationalIssue()]),
      listServiceAttention: vi.fn(async () => { throw new Error("private database detail"); }),
    });
    const center = await new AdminActionCenterService(deps).getActionCenter(
      ["admin.dashboard.view", "admin.service.view"], NOW,
    );
    expect(center.items).toHaveLength(1);
    expect(center.sourceWarnings).toEqual([{ source: "service", label: "Сервис" }]);
    expect(console.error).toHaveBeenCalledWith({
      event: "admin_action_source_failed", source: "service", errorType: "Error",
    });
  });
});

function operationalIssue(runId = "run-1"): AdminOperationalIssue {
  return {
    id: `prices:${runId}`, domain: "prices", severity: "HIGH", status: "ACTIVE", healthStatus: "FAILED",
    startedAt: "2026-09-26T08:00:00.000Z", lastAttemptAt: "2026-09-26T09:00:00.000Z",
    lastSeenAt: "2026-09-26T09:00:00.000Z", lastSuccessAt: "2026-09-25T09:00:00.000Z",
    operation: "price_sync", stage: "publication", safeErrorCode: "PRICE_PUBLICATION_FAILED",
    safeMessage: "Публикация цен не завершилась.", runId, correlationId: runId,
    recoverability: "MANUAL_AVAILABLE", automaticRetryState: "NOT_CONFIGURED", affectedScope: "prices",
    currentDataState: "Последняя успешная публикация остаётся активной.", received: 1, staged: 1,
    published: 0, durationMs: 100, sourceCalls: 1, retryCount: 0, technicalCode: null,
    historyHref: "/admin/integrations/jobs?domain=prices",
    detailHref: `/admin/operations/issues/prices:${runId}`,
  };
}

function serviceItem(
  id = "event-1",
  caseId = "case-1",
  eventCode = "decision_required",
  createdAt = "2026-09-26T10:00:00.000Z",
): ServiceAdminAttentionItem {
  return {
    id, caseId, caseNumber: caseId === "case-1" ? "SRV-001" : "SRV-002", eventCode,
    title: "Сервисное обращение требует решения",
    message: "Проверьте результат диагностики и выберите следующий шаг.",
    actionUrl: "https://untrusted.example/service", createdAt,
  };
}

function onboardingRow(status: "received" | "ready_for_approval", index = 0): OnboardingQueueRow {
  return {
    id: index ? `${status}-${index}` : `${status}-id`, onboarding_status: status,
    created_at: "2026-09-26T07:00:00.000Z", company_name: `Компания ${index || "А"}`,
    fiscal_code: null, contact_name: "Иван Петров", phone: null, email: null,
    assigned_manager_user_id: null, assigned_manager: null, match_state: "no_match", sla_state: "on_time",
    duplicate_fiscal_code: false, next_action: "Проверить данные", revision_count: 1,
    assignment_age_seconds: null, clarification_age_seconds: null, partner_response_overdue: false, sla_paused: false,
  };
}

function queue(rows: OnboardingQueueRow[]): OnboardingQueue {
  return {
    rows, totalCount: rows.length, page: 1, pageSize: rows.length || 4, statusCounters: {},
    slaCounters: { newToday: 0, waitingOverFourHours: 0, waitingOverOneDay: 0, awaitingPartnerResponse: 0, awaitingOneCCompany: 0, readyForApproval: 0, unassigned: 0 },
    managers: [], directoryFreshness: { status: "succeeded", synchronizedAt: null, stale: false },
  };
}

function agentApplication(status: "SUBMITTED" | "NEEDS_CLARIFICATION", id: string): CommercialAgentApplication {
  return {
    id, applicantUserId: `user-${id}`, status, displayName: "Анна Попеску", phone: null,
    email: "agent@example.test", locality: null, profession: null, workplace: null,
    agentType: "INDIVIDUAL", legalName: null, applicantVisibleNote: null,
    submittedAt: "2026-09-26T06:00:00.000Z", reviewedAt: null, reviewedBy: null,
    provisionedAgentId: null, revision: 1, createdAt: "2026-09-26T06:00:00.000Z",
    updatedAt: "2026-09-26T06:00:00.000Z",
  };
}

function agentReward(): AgentRewardFinanceQueueItem {
  return {
    saleLinkId: "reward-sale-link",
    agentId: "agent-id",
    agentName: "Culacov Vasili",
    agentCode: "AG-000001",
    customerName: "Pilot customer",
    orderNumber: "NS-002691",
    orderDate: "2026-09-20",
    state: "READY_FOR_PAYOUT",
    amount: 333.13,
    currency: "MDL",
    updatedAt: "2026-09-26T05:00:00.000Z",
  };
}
