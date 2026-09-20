import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { CommercialAgentApplicationForm } from "@/src/modules/agent-application/components";
import { applicationStatusCopy, commercialAgentApplicationCopy } from "@/src/modules/agent-application/presentation";
import type { CommercialAgentStatus } from "@/src/modules/agent-domain";
import { AuthPageShell } from "@/src/modules/auth/components";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";

type Params = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Commercial Agent application | Novotech",
  robots: { index: false, follow: false },
};

export default async function CommercialAgentApplicationPage({ searchParams }: { searchParams: Params }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const copy = commercialAgentApplicationCopy[locale];
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      const next = `/become-partner/agent?lang=${locale}`;
      redirect(`/auth/register?lang=${locale}&intent=agent&next=${encodeURIComponent(next)}`);
    }
    throw error;
  }

  const workspace = await createCommercialAgentApplicationService().getOrCreateApplicantWorkspace(user.id, user.email);
  return (
    <AuthPageShell
      backHref={`/become-partner?lang=${locale}`}
      backLabel={copy.back}
      description={copy.description}
      eyebrow={copy.eyebrow}
      homeHref={`/?lang=${locale}`}
      maxWidth="lg"
      title={copy.title}
    >
      {workspace.existingAgent ? (
        <ExistingAgentState locale={locale} status={workspace.existingAgent.status} />
      ) : workspace.application ? (
        <CommercialAgentApplicationForm application={workspace.application} locale={locale} />
      ) : (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {locale === "ru" ? "Не удалось открыть заявку." : "Cererea nu a putut fi deschisă."}
        </p>
      )}
    </AuthPageShell>
  );
}

function ExistingAgentState({ locale, status }: { locale: "ru" | "ro"; status: CommercialAgentStatus }) {
  const copy = commercialAgentApplicationCopy[locale];
  const active = status === "ACTIVE";
  const blocked = status === "SUSPENDED" || status === "TERMINATED" || status === "REJECTED";
  const statusCopy = applicationStatusCopy(active ? "APPROVED" : "SUBMITTED", locale);
  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="text-lg font-semibold text-emerald-950">{copy.existingTitle}</h2>
      <p className="mt-1 text-sm leading-6 text-emerald-900">{active ? copy.existingActive : blocked ? copy.existingBlocked : copy.existingPending}</p>
      {!active && !blocked ? <p className="mt-2 text-xs text-emerald-800">{statusCopy.description}</p> : null}
      {active ? <Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white" href="/agent">{copy.openCabinet}</Link> : null}
    </section>
  );
}
