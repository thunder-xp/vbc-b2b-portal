import Link from "next/link";
import { Wrench } from "lucide-react";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { getInstallationMarketplaceService } from "@/src/modules/installation-marketplace/server";
import { marketplaceCopy, needLabels, objectLabels, statusLabels } from "@/src/modules/installation-marketplace/copy";

export default async function CustomerInstallationsPage() {
  const [,locale]=await Promise.all([getFinalCustomerContext(),getFinalCustomerLocale()]);
  const copy=marketplaceCopy[locale];
  const projects=await getInstallationMarketplaceService().listCustomer(locale);
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-emerald-700">Novotech Marketplace</p><h1 className="mt-1 text-2xl font-semibold">{copy.projects}</h1></div><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white" href="/account/installations/new"><Wrench aria-hidden className="size-4"/>{copy.newProject}</Link></header>
    {projects.length?<div className="grid gap-3">{projects.map(project=><Link className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 hover:border-emerald-600 sm:grid-cols-[1fr_auto] sm:items-center" href={`/account/installations/${project.id}`} key={project.id}><div><p className="font-semibold">{needLabels[locale][project.needType]}</p><p className="mt-1 text-sm text-zinc-600">{objectLabels[locale][project.objectType]} · {project.locality}{project.partnerName?` · ${project.partnerName}`:""}</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">{statusLabels[locale][project.status]}</span></Link>)}</div>:<div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">{copy.empty}</div>}
  </main>;
}
