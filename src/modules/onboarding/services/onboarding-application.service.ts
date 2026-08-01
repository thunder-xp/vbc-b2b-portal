import { z } from "zod";

import type { OnboardingRepository } from "../repositories";
import type {
  OnboardingCompanyVerificationOutcome,
  OnboardingDetail,
  OnboardingDetailRecord,
} from "../types";
import { OnboardingApplicationError } from "./onboarding-application.errors";

const applicationIdSchema = z.string().uuid();

export class OnboardingApplicationService {
  constructor(private readonly repository: OnboardingRepository) {}

  async getDetail(applicationId: string): Promise<OnboardingDetail> {
    const parsedId = applicationIdSchema.safeParse(applicationId);
    if (!parsedId.success) {
      throw new OnboardingApplicationError("ONBOARDING_APPLICATION_NOT_FOUND");
    }

    try {
      const detail = await this.repository.getDetail(parsedId.data);
      if (!detail) {
        throw new OnboardingApplicationError("ONBOARDING_APPLICATION_NOT_FOUND");
      }
      const application = { ...detail };
      Reflect.deleteProperty(application, "companyVerificationContext");
      return {
        ...application,
        companyVerification: evaluateCompanyVerification(detail),
      };
    } catch (error) {
      if (error instanceof OnboardingApplicationError) throw error;
      if (postgresErrorCode(error) === "42501") {
        throw new OnboardingApplicationError("ONBOARDING_ACCESS_DENIED");
      }
      throw new OnboardingApplicationError("ONBOARDING_LOAD_FAILED");
    }
  }
}

const DIRECTORY_FRESHNESS_MS = 36 * 60 * 60 * 1000;

export function evaluateCompanyVerification(
  detail: OnboardingDetailRecord,
  now = Date.now(),
): OnboardingDetail["companyVerification"] {
  const context = detail.companyVerificationContext;
  const exactCandidates = detail.candidates.filter(
    (candidate) => candidate.matchReason === "exact_fiscal_code",
  );
  const lastSuccess = context.lastSuccessfulAt
    ? Date.parse(context.lastSuccessfulAt)
    : Number.NaN;
  const latestStarted = context.latestStartedAt
    ? Date.parse(context.latestStartedAt)
    : Number.NaN;
  const failedAfterLastSuccess = context.latestStatus === "failed" && (
    !Number.isFinite(lastSuccess) ||
    (Number.isFinite(latestStarted) && latestStarted > lastSuccess)
  );
  const stale = !Number.isFinite(lastSuccess) || now - lastSuccess > DIRECTORY_FRESHNESS_MS;

  let outcome: OnboardingCompanyVerificationOutcome;
  if (failedAfterLastSuccess) outcome = "directory_sync_failed";
  else if (stale) outcome = "directory_stale";
  else if (exactCandidates.length === 0) outcome = "no_match";
  else if (exactCandidates.length > 1) outcome = "multiple_matches";
  else if (!exactCandidates[0]!.active) outcome = "counterparty_inactive";
  else if (
    exactCandidates[0]!.contractCount === 0 ||
    exactCandidates[0]!.priceProfileCount === 0
  ) outcome = "commercial_mapping_incomplete";
  else outcome = "exact_match_found";

  const presentation = companyVerificationPresentation(outcome);
  return {
    outcome,
    exactCandidateCount: exactCandidates.length,
    exactCandidateIds: exactCandidates.map(({ id }) => id),
    lastSuccessfulDirectorySyncAt: context.lastSuccessfulAt,
    directoryFreshness: failedAfterLastSuccess
      ? "failed"
      : !Number.isFinite(lastSuccess)
        ? "unavailable"
        : stale ? "stale" : "fresh",
    latestSyncStatus: context.latestStatus,
    waitingSince: context.waitingSince,
    waitingInternalNote: context.waitingInternalNote,
    blocked: !["exact_match_found", "commercial_mapping_incomplete"].includes(outcome),
    ...presentation,
  };
}

function companyVerificationPresentation(outcome: OnboardingCompanyVerificationOutcome): {
  reason: string;
  responsibleParty: string;
  nextAction: string;
} {
  return {
    exact_match_found: {
      reason: "Найдено одно активное точное совпадение по IDNO.",
      responsibleParty: "Ответственный менеджер Novotech",
      nextAction: "Подтвердить компанию и перейти к коммерческим условиям.",
    },
    no_match: {
      reason: "Контрагент с указанным IDNO отсутствует в актуальном справочнике 1С.",
      responsibleParty: "Сотрудник Novotech, ответственный за справочник контрагентов 1С",
      nextAction: "Создать контрагента в 1С либо обновить справочник, если он уже создан.",
    },
    multiple_matches: {
      reason: "В справочнике 1С найдено несколько контрагентов с одинаковым IDNO.",
      responsibleParty: "Администратор 1С",
      nextAction: "Устранить дубликат в 1С и повторно обновить справочник.",
    },
    directory_stale: {
      reason: "Последний успешный снимок справочника 1С устарел или отсутствует.",
      responsibleParty: "Ответственный за интеграцию 1С",
      nextAction: "Обновить справочник 1С перед проверкой компании.",
    },
    directory_sync_failed: {
      reason: "Последнее обновление справочника 1С завершилось ошибкой.",
      responsibleParty: "Ответственный за интеграцию 1С",
      nextAction: "Повторить обновление и проверить безопасный код ошибки.",
    },
    counterparty_inactive: {
      reason: "Точное совпадение по IDNO найдено, но контрагент неактивен в 1С.",
      responsibleParty: "Ответственный за контрагентов в 1С",
      nextAction: "Проверить состояние контрагента в 1С и обновить справочник.",
    },
    commercial_mapping_incomplete: {
      reason: "Контрагент найден, но договор или статус партнёра ещё не опубликован.",
      responsibleParty: "Ответственный менеджер и администратор 1С",
      nextAction: "Подтвердить компанию и завершить коммерческую настройку перед одобрением.",
    },
  }[outcome];
}

function postgresErrorCode(error: unknown): string | null {
  const cause = error instanceof Error
    ? (error as Error & { cause?: unknown }).cause
    : null;
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code?: unknown }).code ?? "")
    : null;
}
