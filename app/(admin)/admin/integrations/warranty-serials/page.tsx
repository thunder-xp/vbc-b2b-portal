import { requireAdminPagePermission } from "@/src/modules/admin";
import { getWarrantySerialDiagnosticsAction, WarrantySerialDiagnosticsView } from "@/src/modules/warranty-serials";

export default async function WarrantySerialDiagnosticsPage() {
  await requireAdminPagePermission("admin.integrations.warranty_serials.view");
  const result = await getWarrantySerialDiagnosticsAction();
  if (!result.success) throw new Error("Warranty serial diagnostics are unavailable.");
  return <main className="space-y-6"><header><p className="text-xs font-semibold uppercase text-emerald-700">Интеграции</p><h1 className="mt-2 text-3xl font-semibold">Серийные номера и гарантия</h1><p className="mt-2 text-sm text-zinc-600">Состояние локальной проекции продаж, возвратов и консервативной гарантийной проверки.</p></header><WarrantySerialDiagnosticsView data={result.data} /></main>;
}
