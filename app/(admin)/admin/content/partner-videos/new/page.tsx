import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { AdminExpertiseVideoEditor } from "@/src/modules/partner-expertise/AdminExpertiseVideoEditor";

export default async function NewPartnerVideoPage() { await requireAdminPagePermission("content.manage"); return <main className="mx-auto max-w-5xl space-y-6"><header><p className="text-xs font-semibold uppercase text-emerald-700">Видео для партнёров</p><h1 className="mt-1 text-2xl font-semibold">Новое видео</h1></header><AdminExpertiseVideoEditor video={null} /></main>; }
