import { redirect } from "next/navigation";

import { AccessContextAuthenticationError, resolveCurrentCustomerAccess } from "@/src/modules/auth/access-context";
import { LocalizedAccessState } from "@/src/modules/auth/components";

export default async function CustomerNotActivePage() {
  try {
    const resolution = await resolveCurrentCustomerAccess();
    if (resolution.status === "AVAILABLE") redirect("/account");
    if (resolution.status === "BLOCKED") redirect("/auth/customer-access-state");
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth/customer");
    throw error;
  }
  return <LocalizedAccessState kind="CUSTOMER_NOT_ACTIVE" />;
}
