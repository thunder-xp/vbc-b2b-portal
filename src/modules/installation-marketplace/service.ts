import "server-only";

import { createHash } from "node:crypto";
import type { InstallationMarketplaceRepository } from "./repository";
import { rankInstallationPartners } from "./ranking";
import { INSTALLATION_DECLINE_REASONS, INSTALLATION_NEED_TYPES, INSTALLATION_OBJECT_TYPES, INSTALLATION_PARTNER_AVAILABILITY, INSTALLATION_PARTNER_CAPABILITIES, INSTALLATION_PARTNER_REJECTION_REASONS } from "./types";
import type { InstallationMarketplaceSupplyFilter, InstallationPartnerAvailability, InstallationPartnerCapability, InstallationPartnerRejectionReason } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InstallationMarketplaceInputError extends Error {
  constructor() { super("Invalid Installation Marketplace input."); this.name = "InstallationMarketplaceInputError"; }
}

export class InstallationMarketplaceService {
  constructor(private readonly repository: InstallationMarketplaceRepository) {}

  listRegions(locale: "ru" | "ro") { return this.repository.listRegions(locale); }
  isCustomerOrderEligible(orderId: string) { requireUuid(orderId); return this.repository.isCustomerOrderEligible(orderId); }

  create(input: { sourceType: string; sourceOrderId?: string | null; sourcePublicProductId?: string | null; objectType: string; locality: string; regionCode?: string | null; needType: string; description?: string | null; contactConsent: boolean; creationKey: string }) {
    const sourceOrderId = optionalUuid(input.sourceOrderId);
    const sourcePublicProductId = optionalUuid(input.sourcePublicProductId);
    if (!["PRODUCT", "ORDER", "CUSTOM"].includes(input.sourceType) || !INSTALLATION_OBJECT_TYPES.includes(input.objectType as never)
      || !INSTALLATION_NEED_TYPES.includes(input.needType as never) || !UUID.test(input.creationKey)
      || !input.contactConsent || bounded(input.locality, 2, 160) === null) throw new InstallationMarketplaceInputError();
    return this.repository.createProject({ ...input, sourceOrderId, sourcePublicProductId, locality: input.locality.trim(), regionCode: input.regionCode?.trim() || null, description: optionalText(input.description, 1000), creationKey: input.creationKey });
  }
  listCustomer(locale: "ru" | "ro", limit = 20, offset = 0) { return this.repository.listCustomerProjects(pageLimit(limit), pageOffset(offset), locale); }
  getCustomer(projectId: string, locale: "ru" | "ro") { requireUuid(projectId); return this.repository.getCustomerProject(projectId, locale); }
  async shortlist(projectId: string, customerAccountId: string, locale: "ru" | "ro") {
    ids(projectId, customerAccountId);
    const evidence = await this.repository.getRankingEvidence(projectId, customerAccountId, locale);
    const fingerprintInput = { ...evidence, generatedAt: undefined };
    const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
    const decision = { ...rankInstallationPartners(evidence, 5), evidenceFingerprint: fingerprint };
    await this.repository.recordRankingDecision(decision, customerAccountId, 5);
    return decision.shortlist;
  }
  select(input: { projectId: string; providerId: string; expectedRevision: number; idempotencyKey: string }) { ids(input.projectId, input.providerId, input.idempotencyKey); revision(input.expectedRevision); return this.repository.selectPartner(input); }
  transitionCustomer(input: { projectId: string; command: "CONFIRM" | "DISPUTE" | "CANCEL"; expectedRevision: number; idempotencyKey: string }) { ids(input.projectId, input.idempotencyKey); revision(input.expectedRevision); return this.repository.transitionCustomer(input); }
  review(input: { projectId: string; overall: number; workmanship: number; communication: number; agreement: number; comment?: string | null; idempotencyKey: string }) {
    ids(input.projectId, input.idempotencyKey); for (const rating of [input.overall,input.workmanship,input.communication,input.agreement]) if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new InstallationMarketplaceInputError();
    return this.repository.submitReview({ ...input, comment: optionalText(input.comment, 1000) });
  }
  listPartner(companyId: string, view: "new" | "active" | "completed", locale: "ru" | "ro") { requireUuid(companyId); if (!["new","active","completed"].includes(view)) throw new InstallationMarketplaceInputError(); return this.repository.listPartnerProjects({ companyId, view, locale, limit: 25, offset: 0 }); }
  respondPartner(input: { companyId: string; assignmentId: string; decision: "ACCEPT" | "DECLINE"; reason?: string | null; reasonNote?: string | null; expectedRevision: number; idempotencyKey: string }) {
    ids(input.companyId,input.assignmentId,input.idempotencyKey); revision(input.expectedRevision); const reason=input.reason?.trim()||null;
    if (input.decision==="DECLINE" && !INSTALLATION_DECLINE_REASONS.includes(reason as never)) throw new InstallationMarketplaceInputError();
    return this.repository.respondPartner({ ...input, reason, reasonNote: optionalText(input.reasonNote,300) });
  }
  transitionPartner(input: { companyId: string; assignmentId: string; command: "CONTACTED" | "SCHEDULED" | "INSTALLED"; plannedFor?: string | null; expectedRevision: number; idempotencyKey: string }) {
    ids(input.companyId,input.assignmentId,input.idempotencyKey); revision(input.expectedRevision); const plannedFor=input.plannedFor?.trim()||null;
    if (input.command==="SCHEDULED" && (!plannedFor || Number.isNaN(new Date(plannedFor).getTime()))) throw new InstallationMarketplaceInputError();
    return this.repository.transitionPartner({ ...input, plannedFor });
  }
  listAdmin(status: string | null) { return this.repository.listAdmin(100,status?.trim()||null); }
  getAdminRankingDiagnostics(projectId: string | null) { const normalized=optionalUuid(projectId); return this.repository.getAdminRankingDiagnostics(normalized); }
  moderate(input: { reviewId: string; status: "PUBLISHED" | "PENDING_REVIEW" | "HIDDEN"; expectedRevision: number; reason: string; correlationId: string }) { ids(input.reviewId,input.correlationId); revision(input.expectedRevision); if (!bounded(input.reason,5,500)) throw new InstallationMarketplaceInputError(); return this.repository.moderateReview({ ...input, reason: input.reason.trim() }); }
  getPartnerActivation(companyId: string, locale: "ru" | "ro") { requireUuid(companyId); return this.repository.getPartnerActivation(companyId, locale); }
  optInPartner(companyId: string) { requireUuid(companyId); return this.repository.optInPartner(companyId); }
  savePartnerActivation(input: { companyId: string; descriptionRu?: string | null; descriptionRo?: string | null; availability: string; maxConcurrentJobs?: number | null; capabilities: string[]; regionCodes: string[]; acceptTerms: boolean; acceptPrivacy: boolean; expectedRevision: number }) {
    requireUuid(input.companyId); revision(input.expectedRevision);
    if (!INSTALLATION_PARTNER_AVAILABILITY.includes(input.availability as InstallationPartnerAvailability)
      || input.capabilities.some((value) => !INSTALLATION_PARTNER_CAPABILITIES.includes(value as InstallationPartnerCapability))
      || input.regionCodes.some((value) => !bounded(value, 2, 80))
      || input.maxConcurrentJobs !== null && input.maxConcurrentJobs !== undefined && (!Number.isInteger(input.maxConcurrentJobs) || input.maxConcurrentJobs < 1 || input.maxConcurrentJobs > 100)) throw new InstallationMarketplaceInputError();
    return this.repository.savePartnerActivation({
      companyId: input.companyId, descriptionRu: optionalText(input.descriptionRu, 1000), descriptionRo: optionalText(input.descriptionRo, 1000),
      availability: input.availability as InstallationPartnerAvailability, maxConcurrentJobs: input.maxConcurrentJobs ?? null,
      capabilities: [...new Set(input.capabilities)] as InstallationPartnerCapability[], regionCodes: [...new Set(input.regionCodes)],
      acceptTerms: input.acceptTerms, acceptPrivacy: input.acceptPrivacy, expectedRevision: input.expectedRevision,
    });
  }
  submitPartnerActivation(companyId: string, expectedRevision: number) { requireUuid(companyId); revision(expectedRevision); return this.repository.submitPartnerActivation(companyId, expectedRevision); }
  getPartnerActivationAdminReport() { return this.repository.getPartnerActivationAdminReport(); }
  reviewPartnerActivation(input: { providerId: string; action: "APPROVE" | "REJECT" | "SUSPEND" | "REACTIVATE"; rejectionReason?: string | null; note?: string | null; expectedRevision: number }) {
    requireUuid(input.providerId); revision(input.expectedRevision);
    const reason = input.rejectionReason?.trim() || null;
    if (!["APPROVE","REJECT","SUSPEND","REACTIVATE"].includes(input.action)
      || input.action === "REJECT" && !INSTALLATION_PARTNER_REJECTION_REASONS.includes(reason as InstallationPartnerRejectionReason)) throw new InstallationMarketplaceInputError();
    return this.repository.reviewPartnerActivation({ ...input, rejectionReason: reason as InstallationPartnerRejectionReason | null, note: optionalText(input.note, 500) });
  }
  getSupplyReport(input: { search?: string | null; filter?: string | null; limit?: number; offset?: number }) {
    const allowedFilters: InstallationMarketplaceSupplyFilter[] = ["all","potential","invited","started","pending","active","suspended"];
    const filter = (input.filter?.trim() || "all") as InstallationMarketplaceSupplyFilter;
    if (!allowedFilters.includes(filter)) throw new InstallationMarketplaceInputError();
    const search = optionalText(input.search, 100);
    return this.repository.getSupplyReport({ search, filter, limit: pageLimit(input.limit ?? 25), offset: pageOffset(input.offset ?? 0) });
  }
  savePilotConfiguration(input: { regionCode: string; capability: string; enabled: boolean; threshold: number; expectedRevision: number; correlationId: string }) {
    const regionCode = bounded(input.regionCode, 2, 80);
    if (!regionCode || !INSTALLATION_PARTNER_CAPABILITIES.includes(input.capability as InstallationPartnerCapability)
      || !Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > 20) throw new InstallationMarketplaceInputError();
    revision(input.expectedRevision); requireUuid(input.correlationId);
    return this.repository.savePilotConfiguration({ ...input, regionCode, capability: input.capability as InstallationPartnerCapability });
  }
  prepareInvitation(input: { companyId: string; locale: string; channels: string[]; expiresAt?: string | null; expectedRevision: number; readyToSend: boolean; correlationId: string }) {
    ids(input.companyId,input.correlationId); revision(input.expectedRevision);
    if (!['ru','ro'].includes(input.locale) || !input.channels.length
      || input.channels.some((value)=>!['IN_APP','EMAIL'].includes(value)) || !input.channels.includes('IN_APP')) throw new InstallationMarketplaceInputError();
    const expiresAt=input.expiresAt?.trim()||null;
    if (expiresAt && (Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt)<=new Date())) throw new InstallationMarketplaceInputError();
    return this.repository.prepareInvitation({ companyId:input.companyId, locale:input.locale as "ru"|"ro",
      channels:[...new Set(input.channels)] as Array<"IN_APP"|"EMAIL">, expiresAt,
      expectedRevision:input.expectedRevision, readyToSend:input.readyToSend, correlationId:input.correlationId });
  }
  sendInvitation(input: { invitationId: string; expectedRevision: number; correlationId: string }) {
    ids(input.invitationId,input.correlationId); revision(input.expectedRevision);
    return this.repository.sendInvitation(input);
  }
}

function requireUuid(value: string) { if (!UUID.test(value)) throw new InstallationMarketplaceInputError(); }
function ids(...values: string[]) { values.forEach(requireUuid); }
function revision(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new InstallationMarketplaceInputError(); }
function pageLimit(value: number) { return Number.isSafeInteger(value) ? Math.min(Math.max(value,1),50) : 20; }
function pageOffset(value: number) { return Number.isSafeInteger(value) ? Math.max(value,0) : 0; }
function bounded(value: string | undefined | null,min:number,max:number){const text=value?.trim()??"";return text.length>=min&&text.length<=max?text:null;}
function optionalText(value: string | undefined | null,max:number){const text=value?.trim()??"";if(text.length>max)throw new InstallationMarketplaceInputError();return text||null;}
function optionalUuid(value: string | undefined | null){const text=value?.trim()??"";if(text&&!UUID.test(text))throw new InstallationMarketplaceInputError();return text||null;}
