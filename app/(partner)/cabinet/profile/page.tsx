import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { ProfileForm } from "@/src/modules/access-control/components/onboarding";
import { EmptyState } from "@/src/modules/partner-cabinet/components";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { BusinessPhoneEnrollmentLink } from "@/src/modules/quick-auth/components/BusinessPhoneEnrollmentLink";
import { isBusinessPhoneOtpEnabled } from "@/src/modules/quick-auth/factory";
import { redirect } from "next/navigation";

export default async function CabinetProfilePage() {
  const [profileResult, locale] = await Promise.all([getCurrentProfileAction(), getPartnerLocale()]);

  if (!profileResult.success) {
    redirect("/auth/sign-in");
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

  return <div className="grid gap-5"><ProfileForm profile={profileResult.data} />{isBusinessPhoneOtpEnabled() ? <BusinessPhoneEnrollmentLink locale={locale} returnTo="/cabinet/profile" /> : null}</div>;
}
