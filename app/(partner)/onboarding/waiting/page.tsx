import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import {
  AccessRequestStatusList,
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";

export default async function OnboardingWaitingPage() {
  const requestsResult = await getOwnAccessRequestsAction();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!requestsResult.success && (
          <OnboardingStateCard
            message={requestsResult.message}
            primaryHref="/"
            primaryLabel="Back to home"
            title="Request status unavailable"
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
