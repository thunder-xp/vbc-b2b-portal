import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { ProfileForm } from "@/src/modules/access-control/components/onboarding";
import { EmptyState } from "@/src/modules/partner-cabinet/components";

export default async function CabinetProfilePage() {
  const profileResult = await getCurrentProfileAction();

  if (!profileResult.success) {
    return (
      <EmptyState
        actionHref="/onboarding"
        actionLabel="Open onboarding"
        message={profileResult.message}
        title="Profile unavailable"
      />
    );
  }

  if (!profileResult.data) {
    return (
      <EmptyState
        actionHref="/onboarding/profile"
        actionLabel="Create profile"
        message="Create your portal profile before using the partner cabinet."
        title="Profile required"
      />
    );
  }

  return <ProfileForm profile={profileResult.data} />;
}
