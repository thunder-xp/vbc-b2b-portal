import Link from "next/link";

import { SpecificationForm } from "@/src/modules/project-specifications/components";
import { projectCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function NewProjectSpecificationPage() {
  const copy=projectCopy(await getPartnerLocale());
  return <div className="mx-auto max-w-4xl space-y-6"><header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-medium text-emerald-700" href="/cabinet/specifications">← {copy.specificationsBack}</Link><h1 className="mt-2 text-2xl font-semibold">{copy.newSpecificationTitle}</h1><p className="mt-1 text-sm text-zinc-500">{copy.newSpecificationHint}</p></header><section className="rounded-lg border border-zinc-200 bg-white p-6"><SpecificationForm /></section></div>;
}
