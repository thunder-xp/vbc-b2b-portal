import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { FinanceRepository, PublishContractBalanceSnapshotInput } from "../finance.repository";
import type { PartnerContractBalance } from "../../types";

const COLUMNS = "id,company_id,external_contract_ref,contract_number,contract_name,currency_ref,currency_code,signed_balance,source_version,synchronized_at";

type Row = {
  id: string;
  company_id: string;
  external_contract_ref: string;
  contract_number: string;
  contract_name: string;
  currency_ref: string;
  currency_code: string;
  signed_balance: string | number;
  source_version: string | null;
  synchronized_at: string;
};

export class FinanceRepositoryError extends Error {
  constructor() {
    super("Finance repository operation failed.");
    this.name = "FinanceRepositoryError";
  }
}

export class SupabaseFinanceRepository implements FinanceRepository {
  async listActiveContractBalances(companyId: string): Promise<PartnerContractBalance[]> {
    const { data, error } = await (await createClient())
      .from("partner_contract_balances")
      .select(COLUMNS)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("currency_code")
      .order("contract_name")
      .order("id");
    if (error) throw new FinanceRepositoryError();
    return ((data ?? []) as Row[]).map(mapRow);
  }

  async publishContractBalanceSnapshot(input: PublishContractBalanceSnapshotInput): Promise<number> {
    const { data, error } = await createAdminClient().rpc("publish_partner_contract_balances", {
      p_company_id: input.companyId,
      p_counterparty_ref: input.counterpartyRef,
      p_synchronized_at: input.synchronizedAt,
      p_rows: input.rows.map((row) => ({
        external_contract_ref: row.contractReference.externalId,
        contract_number: row.contractNumber,
        contract_name: row.contractName,
        currency_ref: row.currencyReference.externalId,
        currency_code: row.currencyCode,
        signed_balance: row.signedBalance,
        source_version: row.sourceVersion,
      })),
    });
    if (error || typeof data !== "number") throw new FinanceRepositoryError();
    return data;
  }
}

function mapRow(row: Row): PartnerContractBalance {
  return {
    id: row.id,
    companyId: row.company_id,
    externalContractRef: row.external_contract_ref,
    contractNumber: row.contract_number,
    contractName: row.contract_name,
    currencyRef: row.currency_ref,
    currencyCode: row.currency_code,
    signedBalance: String(row.signed_balance),
    sourceVersion: row.source_version,
    synchronizedAt: row.synchronized_at,
  };
}
