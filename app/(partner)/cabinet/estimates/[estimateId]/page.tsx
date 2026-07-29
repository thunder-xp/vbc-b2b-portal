import { notFound } from "next/navigation";
import Link from "next/link";

import { getEstimateAction, getEstimateCommercialOptionsAction, getEstimateWorkflowAction, listEstimateServicesAction } from "@/src/modules/estimates/actions";
import { EstimateCommercialEditor } from "@/src/modules/estimates/components/EstimateCommercialEditor";
import { EstimateWorkflowPanel } from "@/src/modules/estimates/components/EstimateWorkflowPanel";

export default async function EstimateEditorPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const [estimate, services, commercialOptions, workflow] = await Promise.all([
    getEstimateAction(estimateId),
    listEstimateServicesAction(),
    getEstimateCommercialOptionsAction(),
    getEstimateWorkflowAction(estimateId),
  ]);
  if (!estimate.success) {
    if (estimate.errorCode === "NOT_FOUND") notFound();
    return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{estimate.message}</p>;
  }
  if (!services.success || !commercialOptions.success || !workflow.success) return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">Не удалось загрузить данные редактора.</p>;
  const workflowKey = `${estimate.data.revision}:${workflow.data.estimateStatus}:${workflow.data.versions.map((version) => `${version.id}:${version.status}:${version.pdfStatus}`).join("|")}`;
  return <div className="space-y-5">
    <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/estimates" prefetch={false}>← Сметы и КП</Link><p className="mt-3 text-xs font-semibold uppercase text-zinc-500">{estimate.data.estimateNumber}</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{estimate.data.name}</h1><p className="mt-1 text-sm text-zinc-600">{[estimate.data.customerName, estimate.data.projectName].filter(Boolean).join(" · ") || "Заказчик и объект не указаны"}</p></div>
      <div className="flex flex-wrap items-center gap-3"><div className="text-right"><p className="text-xs text-zinc-500">Текущий итог</p><p className="font-semibold text-zinc-950">{estimate.data.total}</p></div><Link className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700" href={`/cabinet/estimates/${estimateId}/preview`} prefetch={false}>Предпросмотр КП</Link></div>
    </header>
    <EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} />
    <EstimateWorkflowPanel initialWorkflow={workflow.data} key={workflowKey} revision={estimate.data.revision} />
  </div>;
}
