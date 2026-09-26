import "server-only";

import {
  createCommercialAgentApplicationService,
  type CommercialAgentApplication,
} from "@/src/modules/agent-application";
import {
  SupabaseOnboardingRepository,
  type OnboardingQueue,
} from "@/src/modules/onboarding";
import {
  createServiceCenterService,
  type ServiceAdminAttentionItem,
} from "@/src/modules/service-center";

import type {
  AdminActionCenter,
  AdminActionDomain,
  AdminActionItem,
  AdminActionLevel,
  AdminActionSourceWarning,
  AdminOperationalIssue,
} from "../types";
import { createAdminOperationsService } from "./admin-operations.service";

const MAX_ITEMS = 24;
const MAX_ITEMS_PER_SOURCE = 8;
const MAX_SERVICE_SIGNALS = 25;

export interface AdminActionCenterDependencies {
  listOperationalIssues(now: Date): Promise<readonly AdminOperationalIssue[]>;
  listServiceAttention(): Promise<readonly ServiceAdminAttentionItem[]>;
  listOnboardingQueue(
    status: "received" | "ready_for_approval",
    limit: number,
  ): Promise<OnboardingQueue>;
  listAgentApplications(limit: number): Promise<readonly CommercialAgentApplication[]>;
}

type SourceDefinition = {
  domain: AdminActionDomain;
  label: string;
  permission: string;
  load: () => Promise<readonly AdminActionSignal[]>;
};

type AdminActionSignal = AdminActionItem & {
  signalPrecedence: number;
};

export class AdminActionCenterService {
  constructor(private readonly dependencies: AdminActionCenterDependencies) {}

  async getActionCenter(
    permissions: readonly string[],
    now = new Date(),
  ): Promise<AdminActionCenter> {
    const allowed = new Set(permissions);
    const sources = this.sources(now).filter((source) => allowed.has(source.permission));
    const results = await Promise.allSettled(sources.map((source) => source.load()));
    const warnings: AdminActionSourceWarning[] = [];
    const projected: AdminActionItem[] = [];

    results.forEach((result, index) => {
      const source = sources[index]!;
      if (result.status === "fulfilled") {
        projected.push(
          ...aggregateSituations(result.value).slice(0, MAX_ITEMS_PER_SOURCE),
        );
        return;
      }
      warnings.push({ source: source.domain, label: source.label });
      console.error({
        event: "admin_action_source_failed",
        source: source.domain,
        errorType:
          result.reason instanceof Error ? result.reason.name : typeof result.reason,
      });
    });

    const uniqueSituations = aggregateSituations(projected);
    uniqueSituations.sort(compareActionItems);
    const items = uniqueSituations.slice(0, MAX_ITEMS);
    return {
      items,
      actionableCount: items.filter(({ level }) =>
        level === "CRITICAL" || level === "ACTION_REQUIRED"
      ).length,
      waitingCount: items.filter(({ level }) => level === "WAITING").length,
      hasMore: uniqueSituations.length > MAX_ITEMS,
      generatedAt: now.toISOString(),
      sourceWarnings: warnings,
    };
  }

  private sources(now: Date): SourceDefinition[] {
    return [
      {
        domain: "integration",
        label: "Интеграции",
        permission: "admin.dashboard.view",
        load: async () => (await this.dependencies.listOperationalIssues(now))
          .map((issue) => operationalIssueItem(issue, now)),
      },
      {
        domain: "service",
        label: "Сервис",
        permission: "admin.service.view",
        load: async () => (await this.dependencies.listServiceAttention())
          .map((item) => serviceAttentionItem(item, now)),
      },
      {
        domain: "onboarding",
        label: "Онбординг партнёров",
        permission: "onboarding.requests.view",
        load: async () => {
          const perStatus = Math.ceil(MAX_ITEMS_PER_SOURCE / 2);
          const [received, ready] = await Promise.all([
            this.dependencies.listOnboardingQueue("received", perStatus),
            this.dependencies.listOnboardingQueue("ready_for_approval", perStatus),
          ]);
          return [...received.rows, ...ready.rows].map((row) => ({
            id: `onboarding:request:${row.id}:${row.onboarding_status}`,
            situationKey: `onboarding:request:${row.id}`,
            signalCount: 1,
            signalPrecedence: row.onboarding_status === "ready_for_approval" ? 200 : 100,
            domain: "onboarding" as const,
            kind: "partner_review" as const,
            level: "ACTION_REQUIRED" as const,
            title: row.onboarding_status === "ready_for_approval"
              ? "Заявка партнёра готова к решению"
              : "Новая заявка партнёра",
            explanation: row.onboarding_status === "ready_for_approval"
              ? `Проверка компании «${bounded(row.company_name)}» завершена. Нужно принять решение по заявке.`
              : `${bounded(row.contact_name, "Представитель компании")} запрашивает доступ для «${bounded(row.company_name)}».`,
            entityLabel: bounded(row.company_name),
            createdAt: validDate(row.created_at, now),
            actionLabel: "Проверить заявку",
            actionHref: `/admin/onboarding/${row.id}`,
            permission: "onboarding.requests.view",
          }));
        },
      },
      {
        domain: "agent",
        label: "Коммерческие агенты",
        permission: "admin.agents.manage",
        load: async () => (await this.dependencies.listAgentApplications(MAX_ITEMS_PER_SOURCE))
          .map((application) => agentApplicationItem(application, now)),
      },
    ];
  }
}

function operationalIssueItem(
  issue: AdminOperationalIssue,
  now: Date,
): AdminActionSignal {
  const label = operationalDomainLabel(issue.domain);
  return {
    id: `integration:issue:${issue.id}`,
    situationKey: `integration:issue:${issue.id}`,
    signalCount: 1,
    signalPrecedence: 100,
    domain: "integration",
    kind: "operational_issue",
    level: "CRITICAL",
    title: operationalIssueTitle(issue, label),
    explanation: bounded(
      issue.safeMessage,
      "Операция не завершилась. Проверьте диагностические данные и безопасный вариант восстановления.",
    ),
    entityLabel: label,
    createdAt: validDate(
      issue.lastAttemptAt ?? issue.lastSeenAt ?? issue.startedAt,
      now,
    ),
    actionLabel: issue.recoverability === "MANUAL_REQUIRED"
      ? "Разобраться"
      : "Открыть диагностику",
    actionHref: safeAdminHref(issue.detailHref, "/admin/operations/issues"),
    permission: "admin.dashboard.view",
  };
}

function serviceAttentionItem(
  item: ServiceAdminAttentionItem,
  now: Date,
): AdminActionSignal {
  const presentation = serviceSignalPresentation(item.eventCode);
  return {
    id: `service:request:${item.caseId}:${item.id}`,
    situationKey: `service:request:${item.caseId}`,
    signalCount: 1,
    signalPrecedence: presentation.precedence,
    domain: "service",
    kind: "service_attention",
    level: "ACTION_REQUIRED",
    title: presentation.title ?? bounded(item.title, "Сервисное обращение требует внимания"),
    explanation: presentation.explanation ?? bounded(item.message, "Проверьте обращение и определите следующий шаг."),
    entityLabel: `Обращение ${bounded(item.caseNumber)}`,
    createdAt: validDate(item.createdAt, now),
    actionLabel: "Открыть обращение",
    actionHref: `/admin/service/${item.caseId}`,
    permission: "admin.service.view",
  };
}

function agentApplicationItem(
  application: CommercialAgentApplication,
  now: Date,
): AdminActionSignal {
  const name = bounded(application.displayName, "Новый кандидат");
  const waiting = application.status === "NEEDS_CLARIFICATION";
  return {
    id: `agent:application:${application.id}:${application.status}`,
    situationKey: `agent:application:${application.id}`,
    signalCount: 1,
    signalPrecedence: waiting ? 100 : 200,
    domain: "agent",
    kind: "agent_application",
    level: waiting ? "WAITING" : "ACTION_REQUIRED",
    title: waiting
      ? "Ожидается уточнение от кандидата"
      : "Заявка коммерческого агента",
    explanation: waiting
      ? `Для заявки «${name}» запрошены дополнительные сведения.`
      : `Получена заявка от «${name}». Нужно проверить данные и принять решение.`,
    entityLabel: name,
    createdAt: validDate(application.submittedAt ?? application.createdAt, now),
    actionLabel: waiting ? "Посмотреть заявку" : "Рассмотреть заявку",
    actionHref: `/admin/agents/applications/${application.id}`,
    permission: "admin.agents.manage",
  };
}

function operationalDomainLabel(domain: string): string {
  return {
    catalog: "Каталог",
    prices: "Цены",
    stock: "Остатки",
    arrivals: "Поступления",
    rates: "Курсы валют",
    orders: "Заказы",
    campaigns: "Коммерческие кампании",
  }[domain] ?? "Операционная система";
}

function operationalIssueTitle(
  issue: AdminOperationalIssue,
  label: string,
): string {
  return {
    catalog: "Не завершена загрузка каталога",
    prices: "Не завершена публикация цен",
    stock: "Не обновлены остатки",
    arrivals: "Не обновлены ожидаемые поступления",
    rates: "Не обновлены коммерческие курсы",
    orders: "Обмен заказами требует проверки",
    campaigns: "Публикация коммерческой кампании не завершена",
  }[issue.domain] ?? `Операция «${label}» не завершена`;
}

function serviceSignalPresentation(eventCode: string): {
  precedence: number;
  title: string | null;
  explanation: string | null;
} {
  return {
    service_case_overdue: {
      precedence: 600,
      title: "Сервисная заявка просрочена",
      explanation: "Срок обработки обращения истёк.",
    },
    service_replacement_approval_required: {
      precedence: 500,
      title: "Требуется решение по замене",
      explanation: "По результатам диагностики нужно принять решение о замене.",
    },
    service_document_missing: {
      precedence: 400,
      title: "Не хватает сервисного документа",
      explanation: "Для завершения обращения нужен обязательный документ.",
    },
    decision_required: {
      precedence: 350,
      title: null,
      explanation: null,
    },
    service_partner_responded: {
      precedence: 300,
      title: "Партнёр ответил по заявке",
      explanation: "Получен новый ответ партнёра по обращению.",
    },
    service_case_unassigned: {
      precedence: 200,
      title: "Сервисная заявка не назначена",
      explanation: "Обращению нужно назначить ответственного.",
    },
    service_case_new: {
      precedence: 100,
      title: "Новая сервисная заявка",
      explanation: "Обращение ещё не принято в работу.",
    },
  }[eventCode] ?? { precedence: 250, title: null, explanation: null };
}

function bounded(value: string | null | undefined, fallback = "Объект не указан"): string {
  const normalized = value?.trim().slice(0, 240);
  return normalized || fallback;
}

function validDate(value: string | null | undefined, fallback: Date): string {
  return value && Number.isFinite(Date.parse(value)) ? value : fallback.toISOString();
}

function safeAdminHref(value: string, fallback: string): string {
  return value.startsWith("/admin/") && !value.startsWith("//") ? value : fallback;
}

const LEVEL_ORDER: Record<AdminActionLevel, number> = {
  CRITICAL: 0,
  ACTION_REQUIRED: 1,
  WAITING: 2,
  INFO: 3,
};

function compareActionItems(left: AdminActionItem, right: AdminActionItem): number {
  const level = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
  if (level !== 0) return level;
  const age = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (age !== 0) return age;
  return left.situationKey.localeCompare(right.situationKey);
}

function aggregateSituations(
  signals: readonly (AdminActionItem | AdminActionSignal)[],
): AdminActionItem[] {
  const groups = new Map<string, (AdminActionItem | AdminActionSignal)[]>();
  for (const signal of signals) {
    const group = groups.get(signal.situationKey);
    if (group) group.push(signal);
    else groups.set(signal.situationKey, [signal]);
  }

  return [...groups.entries()].map(([situationKey, group]) => {
    const ranked = [...group].sort(compareSignals);
    const winner = ranked[0]!;
    const createdAt = group.reduce(
      (earliest, signal) =>
        Date.parse(signal.createdAt) < Date.parse(earliest)
          ? signal.createdAt
          : earliest,
      winner.createdAt,
    );
    return {
      id: situationKey,
      situationKey,
      signalCount: group.reduce((count, signal) => count + signal.signalCount, 0),
      domain: winner.domain,
      kind: winner.kind,
      level: winner.level,
      title: winner.title,
      explanation: winner.explanation,
      entityLabel: winner.entityLabel,
      createdAt,
      actionLabel: winner.actionLabel,
      actionHref: winner.actionHref,
      permission: winner.permission,
    };
  });
}

function compareSignals(
  left: AdminActionItem | AdminActionSignal,
  right: AdminActionItem | AdminActionSignal,
): number {
  const level = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
  if (level !== 0) return level;
  const precedence = (right as AdminActionSignal).signalPrecedence -
    (left as AdminActionSignal).signalPrecedence;
  if (Number.isFinite(precedence) && precedence !== 0) return precedence;
  const recency = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (recency !== 0) return recency;
  return left.id.localeCompare(right.id);
}

function defaultDependencies(): AdminActionCenterDependencies {
  const operations = createAdminOperationsService();
  const serviceCenter = createServiceCenterService();
  const onboarding = new SupabaseOnboardingRepository();
  const agents = createCommercialAgentApplicationService();
  return {
    listOperationalIssues: (now) => operations.listOperationalIssues(now),
    listServiceAttention: () => serviceCenter.adminAttention(MAX_SERVICE_SIGNALS),
    listOnboardingQueue: (status, limit) => onboarding.listQueue({
      page: 1,
      pageSize: limit,
      status,
      assignedManager: null,
      unassigned: false,
      sla: null,
      matchState: null,
      search: null,
      locality: null,
      businessType: null,
      submittedFrom: null,
      submittedTo: null,
    }),
    listAgentApplications: (limit) => agents.listForAdmin({
      statuses: ["SUBMITTED", "NEEDS_CLARIFICATION"],
      limit,
    }),
  };
}

export function createAdminActionCenterService(): AdminActionCenterService {
  return new AdminActionCenterService(defaultDependencies());
}
