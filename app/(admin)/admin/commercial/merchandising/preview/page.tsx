import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createMerchandisingService } from "@/src/modules/merchandising/actions";
import { MerchandisingEditorialPreview } from "@/src/modules/merchandising/components";

export const dynamic = "force-dynamic";

export default async function AdminMerchandisingPreviewPage() {
  await requireAdminPagePermission("admin.catalog.view");
  const preview = await createMerchandisingService().getAdminPreview(8);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Сохранённые редакционные подборки без контекста партнёрской компании и конфиденциальных цен."
        eyebrow="Коммерческие данные"
        title="Предпросмотр опубликованной витрины"
      />
      <Link
        className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-500"
        href="/admin/commercial/merchandising"
      >
        Вернуться к управлению
      </Link>
      <MerchandisingEditorialPreview preview={preview} />
    </div>
  );
}
