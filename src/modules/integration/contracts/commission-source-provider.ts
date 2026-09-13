import type {
  CommissionSourceAdjustmentDTO,
  CommissionSourcePageResultDTO,
  CommissionSourcePaymentDTO,
  CommissionSourceRealizationDTO,
  IntegrationPageRequestDTO,
} from "../dto";

export type CommissionSourceListRequestDTO = {
  changedSince?: string | null;
  snapshotAt: string;
  page?: IntegrationPageRequestDTO;
};

/**
 * Provider-neutral read boundary for authoritative accounting facts.
 * Implementations may fetch, normalize, and validate only. Commission policy
 * and projection calculations belong to the service layer.
 */
export interface CommissionSourceProvider {
  listRealizations(
    input: CommissionSourceListRequestDTO,
  ): Promise<CommissionSourcePageResultDTO<CommissionSourceRealizationDTO>>;
  listPayments(
    input: CommissionSourceListRequestDTO,
  ): Promise<CommissionSourcePageResultDTO<CommissionSourcePaymentDTO>>;
  listAdjustments(
    input: CommissionSourceListRequestDTO,
  ): Promise<CommissionSourcePageResultDTO<CommissionSourceAdjustmentDTO>>;
}
