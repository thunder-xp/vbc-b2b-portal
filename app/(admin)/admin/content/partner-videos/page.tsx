import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { getPartnerExpertiseService } from "@/src/modules/partner-expertise/server";
import type { ExpertiseSection, ExpertiseStatus } from "@/src/modules/partner-expertise";

const sections = new Set(["LAB", "ACADEMY"]);
const statuses = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export default async function AdminPartnerVideosPage({ searchParams }: { searchParams: Promise<{ section?: string; status?: string }> }) {
  await requireAdminPagePermission("content.manage");
  const query = await searchParams;
  const section = sections.has(query.section ?? "") ? query.section as ExpertiseSection : null;
  const status = statuses.has(query.status ?? "") ? query.status as ExpertiseStatus : null;
  const page = await getPartnerExpertiseService().listAdmin(section, status);
  return <main className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-700">Контент</p><h1 className="mt-1 text-2xl font-semibold">Видео для партнёров</h1><p className="mt-2 text-sm text-zinc-600">Управление Лабораторией и Академией Novotech.</p></div><Link className="inline-flex min-h-11 items-center bg-emerald-700 px-4 text-sm font-semibold text-white" href="/admin/content/partner-videos/new">Создать видео</Link></header>
    <form className="flex flex-wrap gap-2"><select className="min-h-11 border border-zinc-300 px-3 text-sm" defaultValue={section ?? ""} name="section"><option value="">Все разделы</option><option value="LAB">Лаборатория</option><option value="ACADEMY">Академия</option></select><select className="min-h-11 border border-zinc-300 px-3 text-sm" defaultValue={status ?? ""} name="status"><option value="">Все статусы</option><option value="DRAFT">Черновики</option><option value="PUBLISHED">Опубликованные</option><option value="ARCHIVED">Архив</option></select><button className="min-h-11 border border-zinc-300 px-4 text-sm font-semibold">Применить</button></form>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Видео</th><th className="px-4 py-3">Раздел</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">Порядок</th><th className="px-4 py-3">Обновлено</th></tr></thead><tbody className="divide-y divide-zinc-100">{page.items.map(video => <tr key={video.id}><td className="px-4 py-4"><Link className="font-semibold hover:text-emerald-700" href={`/admin/content/partner-videos/${video.id}`}>{video.titleRu}</Link><p className="mt-1 line-clamp-1 text-xs text-zinc-500">{video.youtubeVideoId}</p></td><td className="px-4 py-4">{video.section === "LAB" ? "Лаборатория" : "Академия"}</td><td className="px-4 py-4">{video.status}</td><td className="px-4 py-4">{video.sortOrder}</td><td className="px-4 py-4">{new Date(video.updatedAt).toLocaleDateString("ru-RU")}</td></tr>)}</tbody></table>{page.items.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">Видео пока не добавлены.</p> : null}</div>
  </main>;
}
