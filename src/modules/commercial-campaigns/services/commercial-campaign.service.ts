import { InvalidStateError } from "../../access-control/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { CommercialCampaignRepository } from "../repositories";
import type { CampaignDraftInput, CampaignFilter } from "../types";

export class CommercialCampaignService {
  constructor(private readonly repository: CommercialCampaignRepository, private readonly workspaceContext: PartnerWorkspaceContextService) {}

  async listPartner(userId: string, input: { filter?: CampaignFilter; page?: number; pageSize?: number } = {}) {
    const companyId = await this.companyId(userId);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const result = await this.repository.listPartner({ companyId, filter: input.filter ?? "active", limit: pageSize, offset: (page - 1) * pageSize });
    return { ...result, page, totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)) };
  }
  async getPartner(userId: string, campaignId: string) { return this.repository.getPartner(await this.companyId(userId), campaignId); }
  async addToCart(userId: string, campaignItemId: string, quantity: number, requestId: string) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new InvalidStateError("Campaign quantity is invalid.");
    return this.repository.addToCart({ companyId: await this.companyId(userId), campaignItemId, quantity, requestId });
  }
  async recordEngagement(userId: string, input: Omit<Parameters<CommercialCampaignRepository["recordEngagement"]>[0], "companyId">) {
    try { await this.repository.recordEngagement({ ...input, companyId: await this.companyId(userId) }); } catch { /* Analytics must not block buying. */ }
  }
  listAdmin(page = 1) { const normalized = Math.max(1, Math.trunc(page)); return this.repository.listAdmin(50, (normalized - 1) * 50); }
  getAdmin(campaignId: string) { return this.repository.getAdmin(campaignId); }
  getBuilderOptions(search?: string) { return this.repository.getBuilderOptions(search?.trim().slice(0, 100)); }
  createDraft(input: CampaignDraftInput) { validateDraft(input); return this.repository.createDraft(input); }
  publish(campaignId: string, requestId: string) { return this.repository.publish(campaignId, requestId); }
  pause(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign pause reason is required."); return this.repository.pause(campaignId, reason.trim()); }

  private async companyId(userId: string): Promise<string> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) throw new InvalidStateError("Partner workspace access is not active.");
    return context.companyId;
  }
}

function validateDraft(input: CampaignDraftInput): void {
  const starts = Date.parse(input.startsAt); const ends = Date.parse(input.endsAt);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(input.code) || input.name.trim().length < 3 || input.partnerTitle.trim().length < 3 || input.partnerDescription.trim().length < 10 || input.termsSummary.trim().length < 3 || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || !input.items.length || input.items.length > 50 || (input.audienceMode === "explicit_company" && !input.companyIds.length)) throw new InvalidStateError("Campaign input is invalid.");
  if (input.items.some((item) => item.minimumQuantity < 1 || item.maximumQuantityPerCompany !== null && item.maximumQuantityPerCompany < item.minimumQuantity)) throw new InvalidStateError("Campaign quantity limits are invalid.");
}
