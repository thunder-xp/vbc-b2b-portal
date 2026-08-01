import { forbidden, notFound } from "next/navigation";

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
  if (!result.success) {
    if (result.errorCode === "ONBOARDING_APPLICATION_NOT_FOUND") notFound();
    if (result.errorCode === "ONBOARDING_ACCESS_DENIED") forbidden();
    return (
      <section className="mx-auto max-w-3xl border-l-4 border-rose-500 bg-rose-50 p-5">
        <h1 className="text-lg font-semibold text-rose-950">Не удалось открыть заявку</h1>
        <p className="mt-2 text-sm text-rose-900">{result.message}</p>
      </section>
    );
  }

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
