import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import {
  AccessRequestForm,
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";
import { UserStatus } from "@/src/modules/access-control/types";

export default async function OnboardingAccessRequestPage() {
  const profileResult = await getCurrentProfileAction();
  const canRequestAccess =
    profileResult.success &&
    profileResult.data &&
    profileResult.data.status !== UserStatus.Suspended &&
    profileResult.data.status !== UserStatus.Revoked &&
    profileResult.data.status !== UserStatus.Rejected;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!profileResult.success && (
          <OnboardingStateCard
            message={profileResult.message}
            primaryHref="/"
            primaryLabel="Back to home"
            title="Sign in required"
          />
        )}

        {profileResult.success && !profileResult.data && (
          <OnboardingStateCard
            message="A portal profile is required before submitting a partner access request. Profile creation is not enabled in this slice."
            primaryHref="/onboarding/profile"
            primaryLabel="View profile state"
            title="Profile required"
          />
        )}

        {profileResult.success && profileResult.data && !canRequestAccess && (
          <OnboardingStateCard
            message="Your profile state does not allow partner access requests."
            primaryHref="/onboarding"
            primaryLabel="Back to onboarding"
            title="Request unavailable"
          />
        )}

        {canRequestAccess && (
          <>
            <AccessRequestForm />
            <OnboardingStateCard
              message="Submitted requests stay pending until a Novotech manager reviews them."
              primaryHref="/onboarding/waiting"
              primaryLabel="View request status"
              secondaryHref="/onboarding/profile"
              secondaryLabel="Profile"
              title="Waiting for approval"
            />
          </>
        )}
      </div>
    </main>
  );
}
