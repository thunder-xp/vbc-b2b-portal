import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import {
  assignOnboardingRequestFormAction,
  getOnboardingDetailAction,
  transitionOnboardingRequestFormAction,
  unassignOnboardingRequestFormAction,
} from "@/src/modules/onboarding/actions";
import { OnboardingDetailView } from "@/src/modules/onboarding/components";
import { createAdminPartnerIntegrityService, requireAdminPagePermission } from "@/src/modules/admin";

export default async function AdminOnboardingDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const context = await requireAdminPagePermission("onboarding.requests.view");
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

  const integrity = result.data.request.status === "approved"
    ? await createAdminPartnerIntegrityService().diagnose(requestId)
    : null;
  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <OnboardingDetailView
          detail={result.data}
          assignAction={assignOnboardingRequestFormAction}
          unassignAction={unassignOnboardingRequestFormAction}
          transitionAction={transitionOnboardingRequestFormAction}
        />
        {integrity ? (
          <section className="mx-4 mb-8 border border-zinc-200 bg-white p-5 sm:mx-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Целостность подключения</h2>
                <p className="mt-1 text-sm text-zinc-600">Результат: {integrity.outcome}</p>
              </div>
              {context.permissions.includes("admin.partner_integrity.manage") ? (
                <Link
                  className="inline-flex min-h-11 items-center bg-zinc-950 px-4 text-sm font-semibold text-white"
                  href={`/admin/partners/users/${integrity.userProfileId}`}
                >
                  Проверить целостность подключения
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
