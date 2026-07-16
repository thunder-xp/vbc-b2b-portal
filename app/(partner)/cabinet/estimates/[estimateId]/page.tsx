import { notFound } from "next/navigation";
import Link from "next/link";

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
  return <><div className="mb-3 flex justify-end"><Link className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700" href={`/cabinet/estimates/${estimateId}/preview`}>Предпросмотр предложения</Link></div><EstimateCommercialEditor commercialOptions={commercialOptions.data} initialEstimate={estimate.data} services={services.data} /></>;
}
