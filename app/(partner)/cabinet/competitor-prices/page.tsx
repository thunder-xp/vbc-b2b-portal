import Link from "next/link";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { getExternalPricesCopy } from "@/src/modules/partner-locale";
import { ExternalPriceRepository, ExternalPriceService } from "@/src/modules/external-prices";
import { ExternalPriceUploadForm } from "@/src/modules/external-prices/components/ExternalPriceUploadForm";

export default async function ExternalPricesPage() {
  const [contextResult,locale]=await Promise.all([getPartnerWorkspaceContextAction(),getPartnerLocale()]);
  if(!contextResult.success) throw new Error(contextResult.errorCode);
  const companyId=new ExternalPriceService().assertCompanyContext(contextResult.data);
  const repository=new ExternalPriceRepository();
  const [sources,uploads]=await Promise.all([repository.listSources(companyId),repository.listUploads(companyId)]);
  const copy=getExternalPricesCopy(locale);
  return <main className="space-y-6">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Novotech B2B</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{copy.title}</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">{copy.subtitle}</p></header>
    <section aria-labelledby="upload-title"><h2 className="text-base font-semibold" id="upload-title">{copy.upload}</h2><ExternalPriceUploadForm sources={sources}/></section>
    <section aria-labelledby="imports-title"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold" id="imports-title">{copy.imports}</h2><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/competitor-prices" prefetch={false}>{copy.refresh}</Link></div>
      {uploads.length?<div className="mt-3 overflow-x-auto border border-zinc-200"><table className="min-w-full text-sm"><thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr><th className="px-3 py-2">{copy.source}</th><th className="px-3 py-2">{copy.file}</th><th className="px-3 py-2">{copy.status}</th><th className="px-3 py-2">{copy.matched}</th><th className="px-3 py-2"></th></tr></thead><tbody className="divide-y divide-zinc-100">{uploads.map(upload=><tr key={upload.id}><td className="px-3 py-3 font-medium">{upload.source_name}</td><td className="px-3 py-3 text-zinc-600">{upload.original_filename}</td><td className="px-3 py-3"><Status value={copy[upload.status]}/></td><td className="px-3 py-3">{upload.matched_rows} / {upload.candidate_rows}</td><td className="px-3 py-3 text-right"><Link className="font-semibold text-emerald-700" href={`/cabinet/competitor-prices/${upload.id}`} prefetch={false}>{copy.open}</Link></td></tr>)}</tbody></table></div>:<p className="mt-3 border-y border-zinc-200 py-6 text-sm text-zinc-500">{copy.noImports}</p>}
    </section>
  </main>;
}
function Status({value}:{value:string}){return <span className="inline-flex min-h-7 items-center border border-zinc-300 bg-zinc-50 px-2 text-xs font-semibold text-zinc-700">{value}</span>;}
