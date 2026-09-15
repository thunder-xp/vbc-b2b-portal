import "server-only";

import type { InstallationMarketplaceRepository } from "./repository";
import { INSTALLATION_DECLINE_REASONS, INSTALLATION_NEED_TYPES, INSTALLATION_OBJECT_TYPES } from "./types";

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
  shortlist(projectId: string, locale: "ru" | "ro") { requireUuid(projectId); return this.repository.listShortlist(projectId, locale, 5); }
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
  moderate(input: { reviewId: string; status: "PUBLISHED" | "PENDING_REVIEW" | "HIDDEN"; expectedRevision: number; reason: string; correlationId: string }) { ids(input.reviewId,input.correlationId); revision(input.expectedRevision); if (!bounded(input.reason,5,500)) throw new InstallationMarketplaceInputError(); return this.repository.moderateReview({ ...input, reason: input.reason.trim() }); }
}

function requireUuid(value: string) { if (!UUID.test(value)) throw new InstallationMarketplaceInputError(); }
function ids(...values: string[]) { values.forEach(requireUuid); }
function revision(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new InstallationMarketplaceInputError(); }
function pageLimit(value: number) { return Number.isSafeInteger(value) ? Math.min(Math.max(value,1),50) : 20; }
function pageOffset(value: number) { return Number.isSafeInteger(value) ? Math.max(value,0) : 0; }
function bounded(value: string | undefined | null,min:number,max:number){const text=value?.trim()??"";return text.length>=min&&text.length<=max?text:null;}
function optionalText(value: string | undefined | null,max:number){const text=value?.trim()??"";if(text.length>max)throw new InstallationMarketplaceInputError();return text||null;}
function optionalUuid(value: string | undefined | null){const text=value?.trim()??"";if(text&&!UUID.test(text))throw new InstallationMarketplaceInputError();return text||null;}
