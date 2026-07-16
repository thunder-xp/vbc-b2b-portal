import { notFound } from "next/navigation";

import { getEstimateVersionProposalPreviewAction } from "@/src/modules/estimates/actions";
import { ProposalDocument, VersionProposalControls } from "@/src/modules/estimates/components";

export default async function EstimateVersionPreviewPage({ params }: { params: Promise<{ estimateId: string; versionId: string }> }) {
  const { estimateId, versionId } = await params;
  const result = await getEstimateVersionProposalPreviewAction(versionId);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p>;
  }
  if (result.data.estimateId !== estimateId) notFound();
  return <div className="-mx-4 -my-6 min-h-screen bg-zinc-100 sm:-mx-6 sm:-my-8"><VersionProposalControls estimateId={estimateId} versionId={versionId} versionNumber={result.data.versionNumber} /><main className="overflow-x-auto p-3 sm:p-8"><ProposalDocument proposal={result.data.proposal} /></main></div>;
}
