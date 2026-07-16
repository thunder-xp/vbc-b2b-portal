import { notFound } from "next/navigation";
import Link from "next/link";

import { getEstimateAction, getEstimateCommercialOptionsAction, getEstimateWorkflowAction, listEstimateServicesAction } from "@/src/modules/estimates/actions";
import { EstimateCommercialEditor, EstimateWorkflowPanel } from "@/src/modules/estimates/components";

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
  return <div className="space-y-5"><div className="flex justify-end"><Link className="inline-flex h-9 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700" href={`/cabinet/estimates/${estimateId}/preview`}>Предпросмотр рабочего предложения</Link></div><EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} /><EstimateWorkflowPanel initialWorkflow={workflow.data} key={workflowKey} revision={estimate.data.revision} /></div>;
}
