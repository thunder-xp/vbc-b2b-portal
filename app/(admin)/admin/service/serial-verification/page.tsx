import { requireAdminPagePermission } from "@/src/modules/admin";
import { InternalWarrantySerialLookup } from "@/src/modules/warranty-serials";

export default async function SerialVerificationPage() {
  await requireAdminPagePermission("admin.service.serial.verify");
  return <main className="space-y-6"><header><p className="text-xs font-semibold uppercase text-emerald-700">Сервис</p><h1 className="mt-2 text-3xl font-semibold">Проверка серийного номера</h1><p className="mt-2 text-sm text-zinc-600">Точный внутренний поиск по локальной истории продаж и возвратов.</p></header><InternalWarrantySerialLookup /></main>;
}
