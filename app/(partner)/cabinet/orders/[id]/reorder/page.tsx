import { notFound } from "next/navigation";

import { getQuickReorderPreviewAction } from "@/src/modules/orders/actions";
import { QuickReorderPanel } from "@/src/modules/orders/components";

export const dynamic = "force-dynamic";

export default async function QuickReorderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getQuickReorderPreviewAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Не удалось подготовить повторный заказ. Попробуйте позже.</div>;
  }
  return <div className="mx-auto max-w-7xl"><QuickReorderPanel preview={result.data} requestKey={crypto.randomUUID()} /></div>;
}
