import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { listProjectSpecificationsAction } from "@/src/modules/project-specifications/actions";
import { StatusBadge } from "@/src/modules/project-specifications/components";
import { actionClassName, EmptyState, PageHeader } from "@/src/modules/platform-ui";
import { projectCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ProjectSpecificationsPage() {
  const locale=await getPartnerLocale(); const copy=projectCopy(locale);
  const result = await listProjectSpecificationsAction();
  return <div className="space-y-6"><PageHeader actions={<Link className={actionClassName.primary} href="/cabinet/specifications/new"><FilePlus2 className="size-4" />{copy.newSpecification}</Link>} description={copy.specificationDescription} title={copy.specifications} />{!result.success ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{copy.loadError}</p> : result.data.length ? <div className="grid gap-3">{result.data.map((specification) => <Link className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-emerald-500 sm:grid-cols-[1fr_auto]" href={`/cabinet/specifications/${specification.id}`} key={specification.id}><div><h2 className="font-semibold">{specification.projectName}</h2><p className="mt-1 text-sm text-zinc-500">{specification.customerSiteName} · {specification.itemCount} {copy.positions}</p></div><StatusBadge locale={locale} status={specification.status} /></Link>)}</div> : <EmptyState actionHref="/cabinet/specifications/new" actionLabel={copy.createSpecification} icon={FilePlus2} message={copy.firstSpecification} title={copy.noSpecifications} />}</div>;
}
