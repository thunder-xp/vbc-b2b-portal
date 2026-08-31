import "server-only";

import { projectPartnerProductCompetitiveIntelligence } from "./partner-product-comparison";
import { CompetitiveIntelligenceRepository } from "./repository";
import type { CompetitiveWindowDays } from "./types";

export class PartnerProductCompetitiveIntelligenceService {
  constructor(private readonly repository = new CompetitiveIntelligenceRepository()) {}

  async getPartnerProduct(companyId: string, productId: string, windowDays: CompetitiveWindowDays = 30) {
    const read = await this.repository.getPartnerProduct(companyId, productId, windowDays);
    return projectPartnerProductCompetitiveIntelligence(read);
  }
}
