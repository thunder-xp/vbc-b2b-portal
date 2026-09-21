import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  CustomerIdentityResolutionService,
  normalizeCustomerEmail,
  normalizeCustomerLegalIdentifier,
  normalizeCustomerPhone,
} from "@/src/modules/customer-identity";

import type { AgentDomainRepository } from "./repository";
import type {
  AgentReferral,
  AgentReferralStatus,
  CommercialAgentStatus,
} from "./types";

export const REFERRAL_CONSENT_TEXT_VERSION = "agent-referral-v1";

export class AgentDomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentDomainValidationError";
  }
}

export class AgentDomainService {
  constructor(
    private readonly repository: AgentDomainRepository,
    private readonly identityResolver: CustomerIdentityResolutionService,
  ) {}

  listAgents() {
    return this.repository.listAgents();
  }

  async getAgent(agentId: string) {
    assertUuid(agentId);
    return this.repository.getAgent(agentId);
  }

  async getAgentWorkspace(userId: string) {
    assertUuid(userId);
    return this.repository.findAgentByUser(userId);
  }

  async createAgent(input: Parameters<AgentDomainRepository["createAgent"]>[0]) {
    if (!input.displayName.trim() || input.displayName.trim().length > 200) {
      throw new AgentDomainValidationError("Укажите корректное имя агента.");
    }
    if (input.agentType === "LEGAL_ENTITY" && !input.legalName?.trim()) {
      throw new AgentDomainValidationError("Для юридического лица укажите юридическое наименование.");
    }
    return this.repository.createAgent({
      ...input,
      displayName: input.displayName.trim(),
      email: input.email?.trim().toLowerCase() || null,
    });
  }

  async transitionAgent(agentId: string, targetStatus: CommercialAgentStatus, actorUserId: string) {
    const detail = await this.getAgent(agentId);
    if (!detail) throw new AgentDomainValidationError("Коммерческий агент не найден.");
    const allowed = AGENT_TRANSITIONS[detail.agent.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new AgentDomainValidationError("Недопустимый переход статуса агента.");
    }
    if (["APPROVED", "ACTIVE"].includes(targetStatus) && detail.agent.complianceStatus !== "APPROVED") {
      throw new AgentDomainValidationError("Сначала завершите compliance-проверку.");
    }
    if (["APPROVED", "ACTIVE"].includes(targetStatus) && !detail.agent.contractReady) {
      throw new AgentDomainValidationError("Сначала подтвердите готовность договора.");
    }
    return this.repository.transitionAgent(agentId, targetStatus, actorUserId);
  }

  async confirmCommercialAgentContract(agentId: string, actorUserId: string) {
    const detail = await this.getAgent(agentId);
    if (!detail) throw new AgentDomainValidationError("Коммерческий агент не найден.");
    if (detail.agent.complianceStatus !== "APPROVED") {
      throw new AgentDomainValidationError("Сначала завершите compliance-проверку.");
    }
    return this.repository.confirmContract(agentId, actorUserId);
  }

  reviewCompliance(input: Parameters<AgentDomainRepository["reviewCompliance"]>[0]) {
    if (input.safeReviewNote && input.safeReviewNote.length > 1000) {
      throw new AgentDomainValidationError("Комментарий проверки слишком длинный.");
    }
    return this.repository.reviewCompliance(input);
  }

  async createReferralToken(input: {
    agentId: string;
    actorUserId: string;
    tokenType?: "QR" | "LINK";
    campaignRef?: string | null;
    expiresAt?: string | null;
  }) {
    const detail = await this.getAgent(input.agentId);
    if (!detail) throw new AgentDomainValidationError("Коммерческий агент не найден.");
    if (detail.agent.status !== "ACTIVE") {
      throw new AgentDomainValidationError("Реферальные ссылки доступны только активному агенту.");
    }
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashReferralToken(rawToken);
    const tokenId = await this.repository.createToken({
      agentId: input.agentId,
      actorUserId: input.actorUserId,
      tokenType: input.tokenType ?? "QR",
      campaignRef: input.campaignRef ?? null,
      expiresAt: input.expiresAt ?? null,
      tokenHash,
    });
    return { tokenId, rawToken };
  }

  revokeReferralToken(tokenId: string, actorUserId: string) {
    assertUuid(tokenId);
    return this.repository.revokeToken(tokenId, actorUserId);
  }

  async isReferralTokenAvailable(rawToken: string) {
    if (!isOpaqueToken(rawToken)) return false;
    return Boolean(await this.repository.findValidToken(hashReferralToken(rawToken)));
  }

  async captureReferral(input: {
    rawToken: string;
    customerKind: "PERSON" | "LEGAL_ENTITY";
    name: string;
    phone?: string | null;
    email?: string | null;
    legalIdentifier?: string | null;
    locality?: string | null;
    objectType?: string | null;
    needSummary: string;
    shortDescription?: string | null;
    projectTiming?: string | null;
    consent: boolean;
  }) {
    if (!isOpaqueToken(input.rawToken)) throw new AgentDomainValidationError("Ссылка недействительна.");
    const tokenHash = hashReferralToken(input.rawToken);
    if (!(await this.repository.findValidToken(tokenHash))) {
      throw new AgentDomainValidationError("Ссылка недействительна или отозвана.");
    }
    if (!input.consent) throw new AgentDomainValidationError("Необходимо согласие на обработку контактных данных.");
    const name = bounded(input.name, 2, 200, "Укажите имя или название клиента.");
    const needSummary = bounded(input.needSummary, 2, 500, "Кратко опишите потребность.");
    const phone = input.phone?.trim() ? normalizeCustomerPhone(input.phone) : null;
    const email = input.email?.trim() ? normalizeCustomerEmail(input.email) : null;
    const legalIdentifier = input.legalIdentifier?.trim()
      ? normalizeCustomerLegalIdentifier(input.legalIdentifier)
      : null;
    if (!phone && !email) throw new AgentDomainValidationError("Укажите телефон или email.");

    const resolution = await this.identityResolver.resolve({
      customerType: input.customerKind,
      phone,
      email,
      legalIdentifier,
      createIfMissing: true,
      exposeCandidateIds: false,
    });

    const referralId = await this.repository.createReferral({
      tokenHash,
      customerIdentityId: resolution.customerIdentityId,
      customerKind: input.customerKind,
      name,
      phone,
      email,
      locality: nullableBounded(input.locality, 120),
      objectType: nullableBounded(input.objectType, 120),
      needSummary,
      shortDescription: nullableBounded(input.shortDescription, 1500),
      projectTiming: nullableBounded(input.projectTiming, 160),
      resolutionStatus: resolution.status,
      resolutionReason: resolution.reason,
      consentTextVersion: REFERRAL_CONSENT_TEXT_VERSION,
      consentGivenAt: new Date().toISOString(),
    });
    return { referralId, resolutionStatus: resolution.status };
  }

  listReferrals() {
    return this.repository.listReferrals();
  }

  async reviewReferral(input: {
    referralId: string;
    action: "REVIEW" | "VERIFY" | "ACTIVATE" | "REJECT";
    actorUserId: string;
    reason?: string | null;
  }) {
    const referral = await this.repository.getReferral(input.referralId);
    if (!referral) throw new AgentDomainValidationError("Реферал не найден.");
    if (input.action === "REVIEW") {
      return this.transition(referral, "PENDING_REVIEW", input.actorUserId);
    }
    if (input.action === "REJECT") {
      return this.transition(referral, "REJECTED", input.actorUserId);
    }
    if (input.action === "ACTIVATE") {
      if (referral.status !== "VERIFIED") {
        throw new AgentDomainValidationError("Сначала подтвердите реферал.");
      }
      return this.repository.createAttribution(referral.id, input.actorUserId);
    }

    if (referral.status !== "PENDING_REVIEW" || !referral.customerIdentityId) {
      throw new AgentDomainValidationError("Для проверки нужна разрешённая customer identity.");
    }
    const [relationship, activeAttribution] = await Promise.all([
      this.repository.detectExistingCustomerRelationship(referral.customerIdentityId),
      this.repository.findActiveAttribution(referral.customerIdentityId),
    ]);
    if (relationship.hasActiveRelationship) {
      return this.repository.transitionReferral({
        referralId: referral.id,
        targetStatus: "EXISTING_CUSTOMER",
        actorUserId: input.actorUserId,
        existingCustomerReason: relationship.reasons.join(","),
      });
    }
    if (activeAttribution) {
      return this.repository.transitionReferral({
        referralId: referral.id,
        targetStatus: activeAttribution.agentId === referral.agentId ? "DUPLICATE" : "CONFLICT",
        actorUserId: input.actorUserId,
        duplicateReason: activeAttribution.agentId === referral.agentId
          ? "ACTIVE_ATTRIBUTION_SAME_AGENT"
          : "ACTIVE_ATTRIBUTION_OTHER_AGENT",
      });
    }
    return this.transition(referral, "VERIFIED", input.actorUserId);
  }

  private transition(referral: AgentReferral, status: AgentReferralStatus, actorUserId: string) {
    const allowed = REFERRAL_TRANSITIONS[referral.status] ?? [];
    if (!allowed.includes(status)) throw new AgentDomainValidationError("Недопустимый переход статуса реферала.");
    return this.repository.transitionReferral({
      referralId: referral.id,
      targetStatus: status,
      actorUserId,
      customerIdentityId: referral.customerIdentityId,
    });
  }
}

export function hashReferralToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

const AGENT_TRANSITIONS: Record<CommercialAgentStatus, readonly CommercialAgentStatus[]> = {
  APPLIED: ["COMPLIANCE_REVIEW", "REJECTED"],
  COMPLIANCE_REVIEW: ["CONTRACT_PENDING", "REJECTED"],
  CONTRACT_PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["TRAINING", "ACTIVE", "SUSPENDED"],
  TRAINING: ["ACTIVE", "SUSPENDED"],
  ACTIVE: ["SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  REJECTED: [],
};

const REFERRAL_TRANSITIONS: Record<AgentReferralStatus, readonly AgentReferralStatus[]> = {
  CAPTURED: ["PENDING_REVIEW", "REJECTED", "EXPIRED"],
  PENDING_REVIEW: ["VERIFIED", "DUPLICATE", "EXISTING_CUSTOMER", "CONFLICT", "REJECTED", "EXPIRED"],
  VERIFIED: ["ACTIVE", "DUPLICATE", "EXISTING_CUSTOMER", "CONFLICT", "REASSIGNED", "TERMINATED"],
  ACTIVE: ["EXPIRED", "CONFLICT", "REASSIGNED", "TERMINATED"],
  DUPLICATE: [],
  EXISTING_CUSTOMER: [],
  CONFLICT: [],
  REJECTED: [],
  EXPIRED: [],
  REASSIGNED: [],
  TERMINATED: [],
};

function isOpaqueToken(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function bounded(value: string, min: number, max: number, message: string) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new AgentDomainValidationError(message);
  }
  return normalized;
}

function nullableBounded(value: string | null | undefined, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) {
    throw new AgentDomainValidationError("Значение слишком длинное.");
  }
  return normalized;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AgentDomainValidationError("Некорректный идентификатор.");
  }
}
