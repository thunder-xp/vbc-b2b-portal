import { redirect } from "next/navigation";

import { AccessContextAuthenticationError, resolveCurrentCustomerAccess } from "@/src/modules/auth/access-context";
import { LocalizedAccessState } from "@/src/modules/auth/components";

export default async function CustomerAccessStatePage() {
  try {
    const resolution = await resolveCurrentCustomerAccess();
    if (resolution.status === "AVAILABLE") redirect("/account");
    if (resolution.status === "NOT_ACTIVE") redirect("/auth/customer-not-active");
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth/customer");
    throw error;
  }
  return <LocalizedAccessState kind="CUSTOMER_BLOCKED" />;
}
