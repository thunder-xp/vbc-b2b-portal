import "server-only";

import { cache } from "react";

import { createClient } from "@/src/lib/supabase/server";

import { BusinessAccessResolver, CustomerAccessResolver } from "./service";
import { SupabaseBusinessAccessRepository, SupabaseCustomerAccessRepository } from "./supabase.repository";

const businessResolver = new BusinessAccessResolver(new SupabaseBusinessAccessRepository());
const customerResolver = new CustomerAccessResolver(new SupabaseCustomerAccessRepository());

export class AccessContextAuthenticationError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AccessContextAuthenticationError";
  }
}
export const getCurrentAuthUserId = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AccessContextAuthenticationError();
  return user.id;
});

export const resolveCurrentBusinessAccess = cache(async () => {
  const userId = await getCurrentAuthUserId();
  return businessResolver.resolve(userId);
});

export const resolveCurrentCustomerAccess = cache(async () => {
  const userId = await getCurrentAuthUserId();
  return customerResolver.resolve(userId);
});

export function createBusinessAccessResolver() {
  return businessResolver;
}
