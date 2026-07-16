import { notFound } from "next/navigation";
import { getEstimateProposalPreviewAction } from "@/src/modules/estimates/actions";
import { ProposalControls, ProposalDocument } from "@/src/modules/estimates/components";

export default async function EstimateProposalPreviewPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params; const result = await getEstimateProposalPreviewAction(estimateId);
  if (!result.success) { if (result.errorCode === "NOT_FOUND") notFound(); return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p>; }
  return <div className="-mx-4 -my-6 min-h-screen bg-zinc-100 sm:-mx-6 sm:-my-8"><ProposalControls estimateId={result.data.estimateId} initialSettings={result.data.proposal.settings} revision={result.data.estimateRevision} selectedTemplateId={result.data.selectedTemplateId} templates={result.data.templates} /><main className="overflow-x-auto p-3 sm:p-8"><ProposalDocument proposal={result.data.proposal} /></main></div>;
}
