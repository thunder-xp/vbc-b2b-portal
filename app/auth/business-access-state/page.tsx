import { redirect } from "next/navigation";

import { AccessContextAuthenticationError, getCurrentAuthUserId } from "@/src/modules/auth/access-context";
import { LocalizedAccessState } from "@/src/modules/auth/components";

export default async function BusinessAccessStatePage() {
  try {
    await getCurrentAuthUserId();
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect("/auth");
    throw error;
  }
  return <LocalizedAccessState kind="BUSINESS_UNAVAILABLE" />;
}
