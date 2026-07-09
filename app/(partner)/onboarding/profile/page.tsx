import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import {
  OnboardingStateCard,
  ProfileForm,
} from "@/src/modules/access-control/components/onboarding";
import { redirect } from "next/navigation";

export default async function OnboardingProfilePage() {
  const profileResult = await getCurrentProfileAction();

  if (!profileResult.success && profileResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {!profileResult.success && (
          <OnboardingStateCard
            message="We could not load your profile right now. Try again, or sign in again if your session expired."
            primaryHref="/"
            primaryLabel="Back to home"
            secondaryHref="/auth/sign-in"
            secondaryLabel="Sign in"
            title="Profile setup"
          />
        )}

        {profileResult.success && !profileResult.data && (
          <ProfileForm profile={null} />
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
