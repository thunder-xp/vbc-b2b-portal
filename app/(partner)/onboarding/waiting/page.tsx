import { redirect } from "next/navigation";

import { getOwnOnboardingStatusAction } from "@/src/modules/onboarding/actions";
import { PartnerOnboardingStatusCenter } from "@/src/modules/onboarding/components/PartnerOnboardingStatusCenter";

export default async function OnboardingWaitingPage() {
  const result = await getOwnOnboardingStatusAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success || !result.data) redirect("/onboarding/access-request");
  if (result.data.status === "approved" && result.data.hasActiveMembership) redirect("/cabinet");
  return <PartnerOnboardingStatusCenter center={result.data} />;
}
