import type { ExternalDemandDetail, ExternalDemandResponseType, ExternalDemandState, ExternalDemandStatus, ExternalDemandSummary } from "../types";

export interface ExternalDemandRepository {
  setPartnerRequest(estimateId: string, estimateItemId: string, action: "request" | "cancel"): Promise<ExternalDemandState>;
  listAdmin(input: { search?: string; status?: ExternalDemandStatus; limit: number; offset: number }): Promise<{ items: ExternalDemandSummary[]; total: number }>;
  getAdminDetail(externalItemId: string): Promise<ExternalDemandDetail | null>;
  searchAdminProducts(query: string, limit: number): Promise<Array<{ id: string; sku: string; name: string }>>;
  transition(input: { requestId: string; expectedVersion: number; status: Exclude<ExternalDemandStatus, "new" | "cancelled">; responseType?: ExternalDemandResponseType; catalogProductId?: string }): Promise<ExternalDemandState>;
  curate(sourceItemId: string, canonicalItemId: string, reason: string): Promise<string>;
}
