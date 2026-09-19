import { redirect } from "next/navigation";

import {
  AccessContextAuthenticationError,
  isCustomerAccessResolverEnabled,
  resolveCurrentCustomerAccess,
} from "@/src/modules/auth/access-context";

export default async function CompleteCustomerAuthPage() {
  if (!isCustomerAccessResolverEnabled()) redirect("/account");

  let status: Awaited<ReturnType<typeof resolveCurrentCustomerAccess>>;
  try {
    status = await resolveCurrentCustomerAccess();
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth/customer");
    throw error;
  }

  if (status.status === "AVAILABLE") redirect("/account");
  if (status.status === "NOT_ACTIVE") redirect("/auth/customer-not-active");
  redirect("/auth/customer-access-state");
}
