import { redirect } from "next/navigation";

import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import {
  AccessRequestStatusList,
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";

export default async function OnboardingWaitingPage() {
  const requestsResult = await getOwnAccessRequestsAction();

  if (!requestsResult.success && requestsResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!requestsResult.success && (
          <OnboardingStateCard
            message="We could not load your request status right now. Try again, or start a new company access request if needed."
            primaryHref="/onboarding/access-request"
            primaryLabel="Request access"
            title="Request status"
          />
        )}

        {requestsResult.success && (
          <>
            <OnboardingStateCard
              message="Your request is waiting for Novotech review. You can cancel a pending request and submit a new one if needed."
              primaryHref="/onboarding/access-request"
              primaryLabel="New request"
              secondaryHref="/onboarding/profile"
              secondaryLabel="Profile"
              title="Waiting for approval"
            />
            <AccessRequestStatusList requests={requestsResult.data} />
          </>
        )}
      </div>
    </main>
  );
}
