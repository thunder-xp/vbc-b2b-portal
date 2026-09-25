import Link from "next/link";
import { redirect } from "next/navigation";

import { decideBusinessRoute, resolveCurrentBusinessAccess } from "@/src/modules/auth/access-context";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { BusinessPhoneEnrollmentCard } from "@/src/modules/quick-auth/components/BusinessPhoneEnrollmentCard";
import { createBusinessPhoneEnrollmentService } from "@/src/modules/quick-auth/enrollment.factory";
import { createBusinessProfilePhoneStateService } from "@/src/modules/quick-auth/enrollment.factory";
import { isBusinessPhoneOtpEnabled } from "@/src/modules/quick-auth/factory";

export default async function BusinessPhoneEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; lang?: string; next?: string }>;
}) {
  const query = await searchParams;
  const locale = query.lang === "ro" || query.lang === "ru" ? query.lang : await getPartnerLocale();

  const resolution = await resolveCurrentBusinessAccess();
  const available = resolution.contexts.filter((context) => context.status === "AVAILABLE");
  if (available.length === 0) redirect("/auth/business-access-state");
  const governedTarget = decideBusinessRoute(resolution).targetRoute;
  const nextPath = safeBusinessPath(query.next) ?? governedTarget;
  if (!isBusinessPhoneOtpEnabled()) redirect(nextPath);
  const phoneState = await createBusinessProfilePhoneStateService().resolveCurrent();
  if (!phoneState) redirect(`/auth/sign-in?lang=${locale}`);
  const challengeId = query.challenge ?? phoneState.challengeId ?? undefined;
  const initialEnrollment = challengeId
    ? await createBusinessPhoneEnrollmentService().load(challengeId)
    : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 sm:py-8">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={nextPath}>Novotech Systems Distribution</Link>
        <div className="mt-4">
          <BusinessPhoneEnrollmentCard
            initialEnrollment={initialEnrollment}
            initialState={phoneState.state}
            locale={locale}
            nextPath={nextPath}
            targetPhone={phoneState.targetPhoneE164}
          />
        </div>
      </section>
    </main>
  );
}

function safeBusinessPath(value: string | undefined) {
  if (!value || value.length > 500 || !value.startsWith("/") || value.startsWith("//")) return null;
  return value.startsWith("/cabinet") || value.startsWith("/agent") || value === "/auth/select-context"
    ? value
    : null;
}
