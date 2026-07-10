import { redirect } from "next/navigation";

import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import {
  AccessRequestStatusList,
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";
import { AccessRequestStatus, MembershipStatus } from "@/src/modules/access-control/types";

export default async function OnboardingWaitingPage() {
  const membershipsResult = await getOwnMembershipsAction();
  const requestsResult = await getOwnAccessRequestsAction();

  if (!membershipsResult.success && membershipsResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  if (!requestsResult.success && requestsResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  const hasApprovedRequest =
    requestsResult.success &&
    requestsResult.data.some(
      (request) => request.status === AccessRequestStatus.Approved,
    );
  const hasActiveMembership =
    membershipsResult.success &&
    membershipsResult.data.some(
      (membership) => membership.status === MembershipStatus.Active,
    );

  if (hasApprovedRequest && hasActiveMembership) {
    redirect("/cabinet");
  }

  const latestRequest = requestsResult.success ? requestsResult.data[0] : null;
  const latestRequestRejected =
    latestRequest?.status === AccessRequestStatus.Rejected;

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
            {latestRequestRejected ? (
              <OnboardingStateCard
                message={
                  latestRequest.decisionReason ??
                  "Your request was rejected. Contact Novotech support or submit a new request if your company data has changed."
                }
                primaryHref="/onboarding/access-request"
                primaryLabel="Submit new request"
                secondaryHref="/onboarding/profile"
                secondaryLabel="Profile"
                title="Request rejected"
              />
            ) : (
              <OnboardingStateCard
                message="Your request is waiting for Novotech review. You can cancel a pending request and submit a new one if needed."
                primaryHref="/onboarding/access-request"
                primaryLabel="New request"
                secondaryHref="/onboarding/profile"
                secondaryLabel="Profile"
                title="Waiting for approval"
              />
            )}
            <AccessRequestStatusList requests={requestsResult.data} />
          </>
        )}
      </div>
    </main>
  );
}
