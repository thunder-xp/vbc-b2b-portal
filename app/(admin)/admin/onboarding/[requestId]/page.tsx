import { notFound } from "next/navigation";

import {
  assignOnboardingRequestFormAction,
  getOnboardingDetailAction,
  transitionOnboardingRequestFormAction,
  unassignOnboardingRequestFormAction,
} from "@/src/modules/onboarding/actions";
import { OnboardingDetailView } from "@/src/modules/onboarding/components";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function AdminOnboardingDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await requireAdminPagePermission("onboarding.requests.view");
  const { requestId } = await params;
  const result = await getOnboardingDetailAction(requestId);
  if (!result.success || !result.data) notFound();

  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <OnboardingDetailView
          detail={result.data}
          assignAction={assignOnboardingRequestFormAction}
          unassignAction={unassignOnboardingRequestFormAction}
          transitionAction={transitionOnboardingRequestFormAction}
        />
      </div>
    </div>
  );
}
