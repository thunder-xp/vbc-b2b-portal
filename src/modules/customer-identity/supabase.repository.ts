import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { CustomerIdentityRepository } from "./repository";
import type { IdentityKeyMatch } from "./types";

export class SupabaseCustomerIdentityRepository
  implements CustomerIdentityRepository
{
  async findKeyMatches(keys: Parameters<CustomerIdentityRepository["findKeyMatches"]>[0]) {
    if (keys.length === 0) return [];
    const hashes = [...new Set(keys.map((key) => key.keyHash))];
    const versions = [...new Set(keys.map((key) => key.keyVersion))];
    const types = [...new Set(keys.map((key) => key.keyType))];
    const { data, error } = await createAdminClient()
      .from("customer_identity_keys")
      .select("customer_identity_id,key_type,key_hash,key_version,verified")
      .in("key_hash", hashes)
      .in("key_version", versions)
      .in("key_type", types)
      .is("revoked_at", null);
    if (error) throw new Error(`Customer identity key lookup failed: ${error.code}`);

    const requested = new Set(
      keys.map((key) => `${key.keyType}:${key.keyVersion}:${key.keyHash}`),
    );
    return (data ?? [])
      .filter((row) =>
        requested.has(`${row.key_type}:${row.key_version}:${row.key_hash}`),
      )
      .map(
        (row): IdentityKeyMatch => ({
          customerIdentityId: row.customer_identity_id,
          keyType: row.key_type,
          keyHash: row.key_hash,
          keyVersion: row.key_version,
          verified: row.verified,
        }),
      );
  }

  async findExternalRef(input: Parameters<CustomerIdentityRepository["findExternalRef"]>[0]) {
    const { data, error } = await createAdminClient()
      .from("customer_external_refs")
      .select("customer_identity_id,system,entity_type,external_id")
      .eq("system", input.system)
      .eq("entity_type", input.entityType)
      .eq("external_id", input.externalId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw new Error(`Customer external identity lookup failed: ${error.code}`);
    return data
      ? {
          customerIdentityId: data.customer_identity_id,
          system: data.system,
          entityType: data.entity_type,
          externalId: data.external_id,
        }
      : null;
  }

  async createIdentity(input: Parameters<CustomerIdentityRepository["createIdentity"]>[0]) {
    const { data, error } = await createAdminClient().rpc(
      "create_customer_identity_with_evidence",
      {
        p_identity_kind: input.kind,
        p_keys: input.keys.map((key) => ({
          key_type: key.keyType,
          key_hash: key.keyHash,
          key_version: key.keyVersion,
          verified: key.verified,
        })),
        p_external_1c_ref: input.external1cRef ?? null,
      },
    );
    if (error || typeof data !== "string") {
      throw new Error(`Customer identity creation failed: ${error?.code ?? "INVALID_RESULT"}`);
    }
    return data;
  }

  async recordReconciliation(input: Parameters<CustomerIdentityRepository["recordReconciliation"]>[0]) {
    const candidates = [...new Set(input.candidateIds)].sort();
    const { error } = await createAdminClient()
      .from("customer_identity_reconciliation_cases")
      .insert({
        case_type: input.caseType,
        status: input.caseType,
        left_customer_identity_id: candidates[0] ?? null,
        right_customer_identity_id: candidates[1] ?? null,
        reason_code: input.reasonCode,
        safe_evidence: { candidateCount: candidates.length },
      });
    if (error) throw new Error(`Customer identity reconciliation write failed: ${error.code}`);
  }
}
