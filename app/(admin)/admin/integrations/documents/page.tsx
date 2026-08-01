import { requireAdminPagePermission } from "@/src/modules/admin";
import { getDocumentHealthAction } from "@/src/modules/documents/actions";
import { DocumentHealthView } from "@/src/modules/documents/components";
export const dynamic="force-dynamic";
export default async function DocumentIntegrationPage(){await requireAdminPagePermission("admin.documents.view");const result=await getDocumentHealthAction();if(!result.success)throw new Error("Document health is unavailable.");return <main className="space-y-7"><header><p className="text-xs font-semibold uppercase text-emerald-700">Интеграции</p><h1 className="mt-2 text-3xl font-semibold">Состояние документов</h1><p className="mt-2 text-sm text-zinc-600">Безопасная диагностика метаданных, файлов и готовности провайдера 1С.</p></header><DocumentHealthView health={result.data}/></main>}
