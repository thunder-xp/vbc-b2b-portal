import Link from "next/link";

import { PurchaseTemplateCreateForm } from "@/src/modules/purchase-templates/components";

export default function NewPurchaseTemplatePage() {
  return <div className="space-y-6"><header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-medium text-emerald-700" href="/cabinet/purchase-templates" prefetch={false}>← Шаблоны закупок</Link><h1 className="mt-2 text-2xl font-semibold">Новый шаблон закупок</h1><p className="mt-2 text-sm text-zinc-600">Создайте шаблон, затем добавьте товары через безопасный поиск каталога.</p></header><PurchaseTemplateCreateForm /></div>;
}
