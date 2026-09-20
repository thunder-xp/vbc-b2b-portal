import { redirect } from "next/navigation";

import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import {
  AccessRequestForm,
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";
import { AccessRequestStatus, UserStatus } from "@/src/modules/access-control/types";

export default async function OnboardingAccessRequestPage() {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    throw error;
  }

  if (user.registrationIntent === "agent") {
    redirect(`/become-partner/agent?lang=${user.preferredRegistrationLocale ?? "ru"}`);
  }

  const profileResult = await getCurrentProfileAction();

  if (!profileResult.success) {
    redirect("/auth/sign-in");
  }

  if (!profileResult.data) {
    redirect("/onboarding/profile");
  }

  const canRequestAccess =
    profileResult.data.status !== UserStatus.Suspended &&
    profileResult.data.status !== UserStatus.Revoked &&
    profileResult.data.status !== UserStatus.Rejected;

  if (canRequestAccess) {
    const requestsResult = await getOwnAccessRequestsAction();

    if (
      requestsResult.success &&
      requestsResult.data.some(
        (request) => request.status === AccessRequestStatus.PendingReview,
      )
    ) {
      redirect("/onboarding/waiting");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!canRequestAccess && (
          <OnboardingStateCard
            message="Your profile state does not allow partner access requests."
            primaryHref="/onboarding"
            primaryLabel="Back to onboarding"
            title="Request unavailable"
          />
        )}

        {canRequestAccess && (
          <AccessRequestForm
            initialName={profileResult.data.fullName ?? ""}
            initialPhone={profileResult.data.phone ?? ""}
            legalForm={user.registrationLegalForm ?? "LEGAL_ENTITY"}
          />
        )}
      </div>
    </main>
  );
}
