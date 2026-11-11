import { ensureCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import {
  OnboardingStateCard,
} from "@/src/modules/access-control/components/onboarding";
import { redirect } from "next/navigation";

export default async function OnboardingProfilePage() {
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

  const profileResult = await ensureCurrentProfileAction();
  if (!profileResult.success) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
        <div className="mx-auto w-full max-w-3xl">
          <OnboardingStateCard
            message="We could not prepare your profile right now. Please try again."
            primaryHref="/onboarding/profile"
            primaryLabel="Try again"
            secondaryHref="/auth/sign-in"
            secondaryLabel="Sign in again"
            title="Profile setup"
          />
        </div>
      </main>
    );
  }
  redirect("/onboarding/access-request");
}
