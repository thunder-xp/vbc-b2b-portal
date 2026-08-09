import { notFound } from "next/navigation";

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
    <EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} workflow={workflow.data} />
    <div id="proposal-versions"><EstimateWorkflowPanel initialWorkflow={workflow.data} key={workflowKey} revision={estimate.data.revision} /></div>
  </div>;
}
