import "server-only";

import type { AdminPartnerIntegrityRepository, PartnerIntegrityRepairInput, PartnerMembershipMutationInput } from "../repositories";
import { SupabaseAdminPartnerIntegrityRepository } from "../repositories";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["partner_owner", "partner_manager", "partner_buyer", "partner_accounting", "partner_viewer"]);

export class AdminPartnerIntegrityService {
  constructor(private readonly repository: AdminPartnerIntegrityRepository) {}

  getUser(profileId: string) {
    return UUID.test(profileId) ? this.repository.getUser(profileId) : Promise.resolve(null);
  }

  diagnose(requestId: string) {
    return UUID.test(requestId) ? this.repository.diagnose(requestId) : Promise.resolve(null);
  }

  listTargetCompanies(search = "") {
    return this.repository.listTargetCompanies(search.trim().slice(0, 100));
  }

  repairApprovedRequest(input: PartnerIntegrityRepairInput) {
    validate(input);
    return this.repository.repairApprovedRequest({ ...input, reason: input.reason.trim() });
  }

  mutateMembership(input: PartnerMembershipMutationInput) {
    validate(input);
    if (!UUID.test(input.userId) || !UUID.test(input.targetCompanyId)) throw new Error("invalid_integrity_repair");
    return this.repository.mutateMembership({ ...input, reason: input.reason.trim() });
  }
}

function validate(input: PartnerIntegrityRepairInput | PartnerMembershipMutationInput): void {
  if (!UUID.test(input.sourceMembershipId) || !UUID.test(input.operationKey) || !UUID.test(input.correlationId)
    || !Number.isInteger(input.expectedSourceVersion) || input.expectedSourceVersion < 1
    || !["move", "add"].includes(input.mode) || !ROLES.has(input.roleCode)
    || input.reason.trim().length < 20 || input.reason.trim().length > 2000) {
    throw new Error("invalid_integrity_repair");
  }
  if ("requestId" in input && (!UUID.test(input.requestId) || !UUID.test(input.counterpartyId))) {
    throw new Error("invalid_integrity_repair");
  }
}

const service = new AdminPartnerIntegrityService(new SupabaseAdminPartnerIntegrityRepository());
export function createAdminPartnerIntegrityService(): AdminPartnerIntegrityService { return service; }
