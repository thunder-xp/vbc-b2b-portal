import { notFound } from "next/navigation";

import { listPartnerDocumentsAction } from "@/src/modules/documents/actions";
import { DocumentCenter } from "@/src/modules/documents/components";
import type { DocumentSection, DocumentStateFilter, PartnerDocumentType } from "@/src/modules/documents/types";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";

export const dynamic = "force-dynamic";
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const params=await searchParams; const value=(key:string)=>typeof params[key]==="string"?params[key] as string:undefined;
  const filters={q:value("q"),section:value("section") as DocumentSection|undefined,type:value("type") as PartnerDocumentType|undefined,language:value("language"),state:value("state") as DocumentStateFilter|undefined};
  const result=await listPartnerDocumentsAction({query:filters.q,section:filters.section,documentType:filters.type,language:filters.language,state:filters.state,page:Number(value("page")??1)});
  if(!result.success){if(result.message.includes("недоступ"))notFound();return <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{result.message}</p>}
  return <main className="mx-auto max-w-7xl px-4 py-8"><BehaviorViewEvent dedupeKey={`documents:${filters.section??"all"}:${filters.type??"all"}:${filters.state??"current"}`} eventName="documents_opened" metadataSafe={{filtered:Boolean(filters.section||filters.type||filters.language||filters.state),searched:Boolean(filters.q)}} resultCount={result.data.totalCount} route="/cabinet/documents" sourceSurface="document_center"/><header className="mb-7"><p className="text-xs font-semibold uppercase text-emerald-700">Партнёрский кабинет</p><h1 className="mt-2 text-3xl font-semibold">Центр документов</h1><p className="mt-2 max-w-3xl text-sm text-zinc-600">Документы вашей компании и технические материалы товаров в одном защищённом разделе.</p></header><DocumentCenter filters={filters} page={result.data}/></main>;
}
