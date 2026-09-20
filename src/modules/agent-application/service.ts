import "server-only";

import type { AgentDomainService } from "@/src/modules/agent-domain/service";

import type { CommercialAgentApplicationRepository } from "./repository";
import type {
  CommercialAgentApplicationInput,
  CommercialAgentApplicationReviewAction,
  CommercialAgentApplicationWorkspace,
} from "./types";

export class CommercialAgentApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialAgentApplicationValidationError";
  }
}

export class CommercialAgentApplicationService {
  constructor(
    private readonly repository: CommercialAgentApplicationRepository,
    private readonly agentService: AgentDomainService,
  ) {}

  async getOrCreateApplicantWorkspace(input: {
    applicantUserId: string;
    email: string;
    registrationLegalForm: "INDIVIDUAL" | "LEGAL_ENTITY" | null;
    preferredLocale: "ru" | "ro" | null;
  }): Promise<CommercialAgentApplicationWorkspace> {
    const { applicantUserId } = input;
    const existingAgent = await this.agentService.getAgentWorkspace(applicantUserId);
    if (existingAgent) return { application: null, existingAgent };
    const application = await this.repository.ensureDraft(input);
    return { application, existingAgent: null };
  }

  getApplicantApplication(applicantUserId: string) {
    return this.repository.findByApplicant(applicantUserId);
  }

  async submit(applicantUserId: string, authenticatedEmail: string, input: CommercialAgentApplicationInput) {
    const existingAgent = await this.agentService.getAgentWorkspace(applicantUserId);
    if (existingAgent) throw new CommercialAgentApplicationValidationError("An operational Agent identity already exists.");
    const normalized = normalizeInput(input, authenticatedEmail);
    return this.repository.submit(applicantUserId, normalized);
  }

  withdraw(applicantUserId: string) {
    return this.repository.withdraw(applicantUserId);
  }

  listForAdmin() {
    return this.repository.listForAdmin();
  }

  countReviewQueue() {
    return this.repository.countReviewQueue();
  }

  async getForAdmin(applicationId: string) {
    assertUuid(applicationId);
    return this.repository.getForAdmin(applicationId);
  }

  async review(input: {
    applicationId: string;
    actorUserId: string;
    action: CommercialAgentApplicationReviewAction;
    safeNote?: string | null;
  }) {
    assertUuid(input.applicationId);
    const safeNote = nullableBounded(input.safeNote, 1000);
    if ((input.action === "REQUEST_CLARIFICATION" || input.action === "REJECT") && !safeNote) {
      throw new CommercialAgentApplicationValidationError("A concise applicant-facing explanation is required.");
    }
    return this.repository.review({ ...input, safeNote });
  }
}

function normalizeInput(input: CommercialAgentApplicationInput, authenticatedEmail: string): CommercialAgentApplicationInput {
  const displayName = bounded(input.displayName, 2, 200, "Укажите имя или публичное название.");
  const email = nullableBounded(authenticatedEmail, 254)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CommercialAgentApplicationValidationError("Введите корректный email.");
  }
  const phone = nullableBounded(input.phone, 32);
  if (!phone || phone.length < 8) {
    throw new CommercialAgentApplicationValidationError("Укажите корректный номер телефона.");
  }
  const legalName = nullableBounded(input.legalName, 240);
  if (input.agentType === "LEGAL_ENTITY" && (!legalName || legalName.length < 2)) {
    throw new CommercialAgentApplicationValidationError("Укажите юридическое наименование.");
  }
  return {
    displayName,
    phone,
    email,
    locality: nullableBounded(input.locality, 120),
    profession: nullableBounded(input.profession, 160),
    workplace: nullableBounded(input.workplace, 200),
    agentType: input.agentType === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL",
    legalName,
  };
}

function bounded(value: string, min: number, max: number, message: string) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new CommercialAgentApplicationValidationError(message);
  }
  return normalized;
}

function nullableBounded(value: string | null | undefined, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) {
    throw new CommercialAgentApplicationValidationError("Значение слишком длинное.");
  }
  return normalized;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CommercialAgentApplicationValidationError("Некорректный идентификатор заявки.");
  }
}
