import { redirect } from "next/navigation";

import { AccessContextAuthenticationError, getCurrentAuthUserId } from "@/src/modules/auth/access-context";
import { LocalizedAccessState } from "@/src/modules/auth/components";

export default async function CustomerNotActivePage() {
  try {
    await getCurrentAuthUserId();
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth/customer");
    throw error;
  }
  return <LocalizedAccessState kind="CUSTOMER_NOT_ACTIVE" />;
}
