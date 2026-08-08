import type { ExternalDemandRepository } from "../repositories";
import type { ExternalDemandResponseType, ExternalDemandStatus } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<ExternalDemandStatus>(["new", "reviewing", "solution_proposed", "closed", "cancelled"]);
const RESPONSES = new Set<ExternalDemandResponseType>(["catalog_product", "governed_alternative", "sourcing_review", "cannot_supply"]);

export class ExternalDemandService {
  constructor(private readonly repository: ExternalDemandRepository) {}

  setPartnerRequest(estimateId: string, estimateItemId: string, action: "request" | "cancel") {
    return this.repository.setPartnerRequest(id(estimateId), id(estimateItemId), action);
  }

  listAdmin(input: { search?: string; status?: string; page?: number }) {
    const page = Number.isInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
    const status = input.status && STATUSES.has(input.status as ExternalDemandStatus) ? input.status as ExternalDemandStatus : undefined;
    return this.repository.listAdmin({ search: input.search?.trim().slice(0, 100) || undefined, status, limit: 25, offset: (page - 1) * 25 });
  }

  getAdminDetail(externalItemId: string) {
    return this.repository.getAdminDetail(id(externalItemId));
  }

  searchAdminProducts(query: string) {
    const normalized = query.trim().slice(0, 100);
    return normalized.length < 2 ? Promise.resolve([]) : this.repository.searchAdminProducts(normalized, 10);
  }

  transition(input: { requestId: string; expectedVersion: number; status: string; responseType?: string; catalogProductId?: string }) {
    const allowed = new Set(["reviewing", "solution_proposed", "closed"]);
    if (!allowed.has(input.status)) throw new Error("Invalid external demand transition.");
    const responseType = input.responseType && RESPONSES.has(input.responseType as ExternalDemandResponseType) ? input.responseType as ExternalDemandResponseType : undefined;
    return this.repository.transition({ requestId: id(input.requestId), expectedVersion: integer(input.expectedVersion), status: input.status as "reviewing" | "solution_proposed" | "closed", responseType, catalogProductId: input.catalogProductId ? id(input.catalogProductId) : undefined });
  }

  curate(sourceItemId: string, canonicalItemId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) throw new Error("Curation reason is invalid.");
    return this.repository.curate(id(sourceItemId), id(canonicalItemId), normalizedReason);
  }
}

function id(value: string) { const normalized = value.trim(); if (!UUID.test(normalized)) throw new Error("Invalid identifier."); return normalized; }
function integer(value: number) { if (!Number.isInteger(value) || value < 0) throw new Error("Invalid version."); return value; }
