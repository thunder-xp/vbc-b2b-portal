import type { ContractBalanceDTO } from "../../integration/dto";
import type { PartnerContractBalance } from "../types";

export type PublishContractBalanceSnapshotInput = {
  companyId: string;
  counterpartyRef: string;
  synchronizedAt: string;
  rows: ContractBalanceDTO[];
};

export interface FinanceRepository {
  listActiveContractBalances(companyId: string): Promise<PartnerContractBalance[]>;
  publishContractBalanceSnapshot(input: PublishContractBalanceSnapshotInput): Promise<number>;
}
