import { notFound } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin";
import { getOnboardingHealthAction } from "@/src/modules/onboarding/actions";
import { OnboardingHealthView } from "@/src/modules/onboarding/components";

export default async function AdminOnboardingHealthPage() {
  await requireAdminPagePermission("onboarding.requests.view");
  const result = await getOnboardingHealthAction();
  if (!result.success || !result.data.allowed) notFound();

  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <OnboardingHealthView health={result.data} />
      </div>
    </div>
  );
}
