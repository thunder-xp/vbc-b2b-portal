import { calculatePartnerMomentum } from "../domain";
import type { PartnerMomentumProjectionRepository } from "../repositories";

export type MomentumProjectionResult = {
  processed: number;
  published: number;
  transitions: number;
  failures: number;
  orderRowsScanned: number;
  durationMs: number;
};

export class PartnerMomentumProjectionService {
  constructor(private readonly repository: PartnerMomentumProjectionRepository) {}

  async enqueueAll(): Promise<number> { return this.repository.enqueueAll(); }

  async process(limit = 20): Promise<MomentumProjectionResult> {
    const startedAt = performance.now();
    const companyIds = await this.repository.claim(Math.max(1, Math.min(limit, 50)));
    const result: MomentumProjectionResult = { processed: companyIds.length, published: 0, transitions: 0, failures: 0, orderRowsScanned: 0, durationMs: 0 };
    for (const companyId of companyIds) {
      try {
        const source = await this.repository.loadSource(companyId);
        result.orderRowsScanned += source.orderRowsScanned;
        const published = await this.repository.publish(calculatePartnerMomentum(source));
        result.published += 1;
        result.transitions += published.transitionCreated;
      } catch (error) {
        result.failures += 1;
        await this.repository.fail(companyId, error instanceof Error ? error.name : "unknown_error");
        console.error({ event: "partner_momentum_projection_company_failed", companyId, errorType: error instanceof Error ? error.name : typeof error });
      }
    }
    result.durationMs = Math.round(performance.now() - startedAt);
    return result;
  }
}

