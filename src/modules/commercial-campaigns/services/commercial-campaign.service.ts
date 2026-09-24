import { InvalidStateError } from "../../access-control/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import { validateCampaignDraft, type CampaignValidationIssue } from "../campaign-draft.contract";
import type { CommercialCampaignRepository } from "../repositories";
import type { CampaignDraftFailureDiagnostic, CampaignDraftInput, CampaignFilter, CampaignProductSearchInput } from "../types";

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
  searchBuilderProducts(input: CampaignProductSearchInput) {
    return this.repository.searchBuilderProducts({
      search: input.search?.trim().slice(0, 100) ?? "",
      categoryId: uuidOrEmpty(input.categoryId),
      brandId: uuidOrEmpty(input.brandId),
      inStockOnly: input.inStockOnly === true,
      page: Math.max(1, Math.trunc(input.page ?? 1)),
      pageSize: Math.min(30, Math.max(10, Math.trunc(input.pageSize ?? 25))),
    });
  }
  createDraft(input: CampaignDraftInput) {
    const issues = validateCampaignDraft(input);
    if (issues.length) throw new CampaignDraftValidationError(issues);
    return this.repository.createDraft(input);
  }
  recordDraftFailure(input: CampaignDraftFailureDiagnostic) { return this.repository.recordDraftFailure(input); }
  publish(campaignId: string, requestId: string) { return this.repository.publish(campaignId, requestId); }
  pause(campaignId: string, reason: string) { if (reason.trim().length < 3) throw new InvalidStateError("Campaign pause reason is required."); return this.repository.pause(campaignId, reason.trim()); }

  private async companyId(userId: string): Promise<string> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) throw new InvalidStateError("Partner workspace access is not active.");
    return context.companyId;
  }
}

export class CampaignDraftValidationError extends Error {
  readonly code = "CAMPAIGN_VALIDATION_FAILED";
  constructor(readonly issues: CampaignValidationIssue[]) {
    super("Campaign draft validation failed.");
    this.name = "CampaignDraftValidationError";
  }
}

function uuidOrEmpty(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : "";
}
