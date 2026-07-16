import { notFound } from "next/navigation";

import { getEstimateAction, getEstimateCommercialOptionsAction, listEstimateServicesAction } from "@/src/modules/estimates/actions";
import { EstimateCommercialEditor } from "@/src/modules/estimates/components";

export default async function EstimateEditorPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const [estimate, services, commercialOptions] = await Promise.all([
    getEstimateAction(estimateId),
    listEstimateServicesAction(),
    getEstimateCommercialOptionsAction(),
  ]);
  if (!estimate.success) {
    if (estimate.errorCode === "NOT_FOUND") notFound();
    return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{estimate.message}</p>;
  }
  if (!services.success || !commercialOptions.success) return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">Не удалось загрузить данные редактора.</p>;
  return <EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} />;
}
