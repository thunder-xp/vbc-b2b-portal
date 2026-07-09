import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import {
  OnboardingStateCard,
  ProfileForm,
} from "@/src/modules/access-control/components/onboarding";

export default async function OnboardingProfilePage() {
  const profileResult = await getCurrentProfileAction();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!profileResult.success && (
          <OnboardingStateCard
            message={profileResult.message}
            primaryHref="/"
            primaryLabel="Back to home"
            title="Profile unavailable"
          />
        )}

        {profileResult.success && !profileResult.data && (
          <OnboardingStateCard
            message="Your authentication session is valid, but a portal profile does not exist yet. Profile creation is not enabled in this slice, so Novotech must complete the onboarding setup."
            primaryHref="/"
            primaryLabel="Back to home"
            title="Profile setup required"
          />
        )}

        {profileResult.success && profileResult.data && (
          <>
            <ProfileForm profile={profileResult.data} />
            <OnboardingStateCard
              message="After your profile is ready, submit or review your partner access request."
              primaryHref="/onboarding/access-request"
              primaryLabel="Request access"
              secondaryHref="/onboarding/waiting"
              secondaryLabel="View status"
              title="Next step"
            />
          </>
        )}
      </div>
    </main>
  );
}
