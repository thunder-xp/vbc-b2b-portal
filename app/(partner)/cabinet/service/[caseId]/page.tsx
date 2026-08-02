import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentUpload,getServiceCaseAction,PartnerServiceActions,PartnerServiceResponse,ServiceCaseSummary,SERVICE_TYPE_LABELS } from "@/src/modules/service-center";

export default async function ServiceDetailPage({params}:{params:Promise<{caseId:string}>}) {
  const {caseId}=await params;
  const result=await getServiceCaseAction(caseId);
  if(!result.success||!result.data)notFound();
  const detail=result.data;
  return <div className="mx-auto max-w-5xl space-y-6"><header><Link className="text-sm font-medium text-emerald-700" href="/cabinet/service">← Все заявки</Link><p className="mt-4 text-xs font-semibold uppercase text-emerald-700">{SERVICE_TYPE_LABELS[detail.caseType]}</p><h1 className="mt-1 text-2xl font-semibold">{detail.caseNumber}</h1><p className="mt-2 text-sm text-zinc-600">Создана {new Date(detail.createdAt).toLocaleDateString("ru-RU")}</p></header><ServiceCaseSummary detail={detail}/><PartnerServiceActions detail={detail}/>{!["closed","rejected","cancelled"].includes(detail.status)?<section className="grid gap-8 border-t border-zinc-200 pt-6 md:grid-cols-2"><div><h2 className="text-lg font-semibold">Добавить информацию</h2><div className="mt-3"><PartnerServiceResponse caseId={detail.id}/></div></div><div><h2 className="text-lg font-semibold">Добавить материалы</h2><div className="mt-3"><AttachmentUpload caseId={detail.id}/></div></div></section>:null}</div>;
}
