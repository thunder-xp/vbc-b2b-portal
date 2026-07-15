import { notFound } from "next/navigation";

import { getEstimateAction, listEstimateServicesAction } from "@/src/modules/estimates/actions";
import { EstimateEditor } from "@/src/modules/estimates/components";

export default async function EstimateEditorPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const [estimate, services] = await Promise.all([
    getEstimateAction(estimateId),
    listEstimateServicesAction(),
  ]);
  if (!estimate.success) {
    if (estimate.errorCode === "NOT_FOUND") notFound();
    return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{estimate.message}</p>;
  }
  if (!services.success) return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">Не удалось загрузить данные редактора.</p>;
  return <EstimateEditor initialEstimate={estimate.data} services={services.data} />;
}
