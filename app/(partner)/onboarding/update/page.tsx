import { redirect } from "next/navigation";

import { getOwnOnboardingStatusAction } from "@/src/modules/onboarding/actions";
import { OnboardingCorrectionForm } from "@/src/modules/onboarding/components/OnboardingCorrectionForm";

export default async function OnboardingUpdatePage() {
  const result = await getOwnOnboardingStatusAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success || !result.data?.canUpdate) redirect("/onboarding/waiting");
  return <OnboardingCorrectionForm center={result.data} />;
}
