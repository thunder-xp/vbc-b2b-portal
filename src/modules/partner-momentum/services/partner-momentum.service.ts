import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { PartnerMomentumRepository } from "../repositories";
import type { MomentumStatus } from "../types";

export class PartnerMomentumService {
  constructor(private readonly repository: PartnerMomentumRepository, private readonly workspaceContext: PartnerWorkspaceContextService) {}

  async getPartnerSummary(userId: string) {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) return null;
    return this.repository.getPartnerSummary(context.companyId);
  }

  async recordPartnerAction(userId: string, input: { actionType: string; actionKey: string; sourceFingerprint: string }): Promise<void> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) return;
    await this.repository.recordAction({ companyId: context.companyId, ...input });
  }

  listAdmin(input: { page?: number; pageSize?: number; status?: MomentumStatus | null; managerId?: string | null; search?: string | null }) {
    return this.repository.listAdmin({ page: Math.max(1, input.page ?? 1), pageSize: Math.max(1, Math.min(input.pageSize ?? 25, 100)), status: input.status ?? null, managerId: input.managerId ?? null, search: input.search?.trim() || null });
  }

  getDiagnostics() { return this.repository.getDiagnostics(); }
}
