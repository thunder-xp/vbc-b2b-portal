import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { getOneCEnv } from "@/src/lib/env";
import { hashCustomerIdentityKey } from "@/src/modules/customer-identity/hmac";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import { FinalCustomerProvisioningService } from "./service";
import { ExternalCustomerProvisioningService } from "./external-service";
import { SupabaseExternalCustomerProvisioningRepository } from "./external-supabase.repository";
import { OneCFinalCustomerProvider } from "./one-c-customer.provider";
import { SupabaseFinalCustomerProvisioningRepository } from "./supabase.repository";
import type { VerifiedRetailOwner } from "./types";

export function createFinalCustomerProvisioningService() {
  return new FinalCustomerProvisioningService(new SupabaseFinalCustomerProvisioningRepository());
}

export function createExternalCustomerProvisioningService() {
  return new ExternalCustomerProvisioningService(
    new SupabaseExternalCustomerProvisioningRepository(),
    new OneCFinalCustomerProvider(getOneCEnv()),
  );
}

export async function getVerifiedRetailOwner(): Promise<VerifiedRetailOwner | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const verifiedPhone = user?.phone ? canonicalMoldovaE164(user.phone) : null;
  if (error || !user?.id || !verifiedPhone || !user.phone_confirmed_at) return null;

  const phoneKey = hashCustomerIdentityKey("PHONE", verifiedPhone, true);
  const { data: account } = await supabase
    .from("customer_accounts")
    .select("status,display_name,email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return {
    authUserId: user.id,
    verifiedPhone,
    phoneKeyHash: phoneKey.keyHash,
    phoneKeyVersion: phoneKey.keyVersion,
    displayName: account?.status === "ACTIVE" ? account.display_name?.trim() || null : null,
    email: account?.status === "ACTIVE" ? account.email?.trim().toLowerCase() || null : null,
  };
}

export async function bindRetailOrderToVerifiedOwner(
  accessTokenHash: string,
  owner: VerifiedRetailOwner,
) {
  void owner.authUserId;
  const { data, error } = await createAdminClient().rpc("bind_retail_order_authenticated_owner_v1", {
    p_access_token_hash: accessTokenHash,
    p_auth_user_id: owner.authUserId,
    p_phone_key_hash: owner.phoneKeyHash,
    p_phone_key_version: owner.phoneKeyVersion,
  });
  if (error) throw new Error(`RETAIL_OWNER_BINDING_${error.code ?? "FAILED"}`);
  return data;
}
