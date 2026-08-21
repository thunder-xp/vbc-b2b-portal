import { notFound } from "next/navigation";
import { getPartnerDocumentAction } from "@/src/modules/documents/actions";
import { DocumentDetail } from "@/src/modules/documents/components";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
export const dynamic="force-dynamic";
export default async function DocumentPage({params}:{params:Promise<{documentId:string}>}){const [{documentId},locale]=await Promise.all([params,getPartnerLocale()]);const result=await getPartnerDocumentAction(documentId);if(!result.success)notFound();return <main className="mx-auto max-w-5xl px-4 py-8"><BehaviorViewEvent dedupeKey={`document:${documentId}`} eventName="document_opened" metadataSafe={{documentType:result.data.documentType,sourceScope:result.data.sourceScope}} route="/cabinet/documents/[documentId]" sourceSurface="document_detail"/><DocumentDetail document={result.data} locale={locale}/></main>}
