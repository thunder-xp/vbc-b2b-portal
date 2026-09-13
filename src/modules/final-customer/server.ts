import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import { SupabaseFinalCustomerRepository } from "./supabase.repository";
import { FinalCustomerAccountService, FinalCustomerAuthenticationError } from "./service";

export function createFinalCustomerService() {
  return new FinalCustomerAccountService(new SupabaseFinalCustomerRepository());
}

export async function getFinalCustomerContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new FinalCustomerAuthenticationError();
  const account = await createFinalCustomerService().ensureAccount(user);
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const resolvedName = account.displayName ?? await new SupabaseFinalCustomerRepository().findDisplayName(account.customerIdentityId);
  return {
    account,
    verifiedPhone: canonicalMoldovaE164(user.phone ?? "") ?? "",
    displayName: resolvedName,
    aal: assurance?.currentLevel ?? null,
  } as const;
}
