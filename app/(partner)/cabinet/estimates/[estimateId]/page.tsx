import { notFound } from "next/navigation";

import { measurePerformanceStage, withRoutePerformance } from "@/src/lib/performance/request-diagnostics";
import {
  canPromptProposalGeneratorFeedbackAction,
  getEstimateAction,
  getEstimateCommercialOptionsAction,
  getEstimateWorkflowAction,
  listEstimateServicesAction,
} from "@/src/modules/estimates/actions";
import { EstimateCommercialEditor } from "@/src/modules/estimates/components/EstimateCommercialEditor";
import { ProposalGeneratorFeedback } from "@/src/modules/estimates/components/ProposalGeneratorFeedback";
import { getEstimatesCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function EstimateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<{ generatorSession?: string; proposalAction?: string; version?: string }>;
}) {
  return withRoutePerformance("estimate_detail", () => renderEstimateEditorPage({ params, searchParams }));
}

async function renderEstimateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<{ generatorSession?: string; proposalAction?: string; version?: string }>;
}) {
  const [{ estimateId }, { generatorSession, proposalAction, version }, locale] = await Promise.all([
    params,
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = getEstimatesCopy(locale);
  const [estimate, services, commercialOptions, workflow] = await Promise.all([
    measurePerformanceStage("estimate_detail", "estimate", () => getEstimateAction(estimateId)),
    measurePerformanceStage("estimate_detail", "services", listEstimateServicesAction),
    measurePerformanceStage("estimate_detail", "commercial_options", getEstimateCommercialOptionsAction),
    measurePerformanceStage("estimate_detail", "workflow", () => getEstimateWorkflowAction(estimateId)),
  ]);
  if (!estimate.success) {
    if (estimate.errorCode === "NOT_FOUND") notFound();
    return (
      <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
        {estimate.message}
      </p>
    );
  }
  if (!services.success || !commercialOptions.success || !workflow.success)
    return (
      <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
        {copy.loadEditorFailed}
      </p>
    );
  const showGeneratorFeedback = generatorSession
    ? await measurePerformanceStage("estimate_detail", "generator_feedback", () =>
        canPromptProposalGeneratorFeedbackAction(generatorSession, estimateId))
    : false;
  return (
    <div className="space-y-5">
      {showGeneratorFeedback && generatorSession && (
        <ProposalGeneratorFeedback sessionId={generatorSession} />
      )}
      <EstimateCommercialEditor
        commercialOptions={commercialOptions.data}
        initialEstimate={estimate.data}
        initialProposalAction={proposalAction === "resend" && version ? { kind: "resend", versionId: version } : null}
        services={services.data}
        workflow={workflow.data}
      />
    </div>
  );
}
