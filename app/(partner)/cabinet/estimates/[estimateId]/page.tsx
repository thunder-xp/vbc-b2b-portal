import { notFound } from "next/navigation";

import { canPromptProposalGeneratorFeedbackAction, getEstimateAction, getEstimateCommercialOptionsAction, getEstimateWorkflowAction, listEstimateServicesAction } from "@/src/modules/estimates/actions";
import { EstimateCommercialEditor } from "@/src/modules/estimates/components/EstimateCommercialEditor";
import { EstimateWorkflowPanel } from "@/src/modules/estimates/components/EstimateWorkflowPanel";
import { ProposalGeneratorFeedback } from "@/src/modules/estimates/components/ProposalGeneratorFeedback";

export default async function EstimateEditorPage({ params, searchParams }: { params: Promise<{ estimateId: string }>; searchParams: Promise<{ generatorSession?: string }> }) {
  const { estimateId } = await params;
  const { generatorSession } = await searchParams;
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
  const workflowKey = `${estimate.data.revision}:${workflow.data.estimateStatus}:${workflow.data.lifecycleStatus}:${workflow.data.versions[0]?.id ?? "none"}:${workflow.data.versions[0]?.status ?? "none"}:${workflow.data.versions[0]?.pdfStatus ?? "none"}`;
  const showGeneratorFeedback = generatorSession ? await canPromptProposalGeneratorFeedbackAction(generatorSession, estimateId) : false;
  return <div className="space-y-5">
    {showGeneratorFeedback && generatorSession && <ProposalGeneratorFeedback sessionId={generatorSession} />}
    <EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} workflow={workflow.data} />
    <EstimateWorkflowPanel initialWorkflow={workflow.data} key={workflowKey} revision={estimate.data.revision} />
  </div>;
}
