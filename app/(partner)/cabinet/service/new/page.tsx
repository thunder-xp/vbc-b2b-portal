import Link from "next/link";
import {
  getServiceSelectionsAction,
  ServiceCaseForm,
} from "@/src/modules/service-center";
import { serviceCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { getPartnerWarrantyVerificationAction } from "@/src/modules/warranty-serials";
export default async function NewServiceCasePage({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = serviceCopy(locale);
  const [result, verification] = await Promise.all([
    getServiceSelectionsAction(),
    params.verification
      ? getPartnerWarrantyVerificationAction(params.verification)
      : Promise.resolve(null),
  ]);
  const verified = verification?.success ? verification.data : null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link
          className="text-sm font-medium text-emerald-700"
          href="/cabinet/service"
        >
          ← {copy.backToCases}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{copy.newTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.newHint}</p>
      </header>
      {verified ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {copy.verifiedHint}
        </p>
      ) : null}
      {result.success ? (
        <ServiceCaseForm selections={result.data} verification={verified} />
      ) : (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {copy.prepareError}
        </p>
      )}
    </div>
  );
}
