import { redirect } from "next/navigation";

import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import { OnboardingStateCard } from "@/src/modules/access-control/components/onboarding";
import { AccessRequestStatus, UserStatus } from "@/src/modules/access-control/types";

export default async function OnboardingPage() {
  const profileResult = await getCurrentProfileAction();

  if (!profileResult.success) {
    redirect("/auth/sign-in");
  }

  if (!profileResult.data) {
    redirect("/onboarding/profile");
  }

  if (
    profileResult.data.status === UserStatus.Suspended ||
    profileResult.data.status === UserStatus.Revoked ||
    profileResult.data.status === UserStatus.Rejected
  ) {
    return (
      <OnboardingShell>
        <OnboardingStateCard
          message="Your portal access is not active. Contact Novotech for assistance."
          primaryHref="/"
          primaryLabel="Back to home"
          title="Access unavailable"
        />
      </OnboardingShell>
    );
  }

  const membershipsResult = await getOwnMembershipsAction();

  if (membershipsResult.success && membershipsResult.data.length > 0) {
    redirect("/cabinet");
  }

  const requestsResult = await getOwnAccessRequestsAction();

  if (
    requestsResult.success &&
    requestsResult.data.some(
      (request) => request.status === AccessRequestStatus.PendingReview,
    )
  ) {
    redirect("/onboarding/waiting");
  }

  redirect("/onboarding/access-request");
}

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </main>
  );
}
