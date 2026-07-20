import Link from "next/link";
import { PurchasingListCreateForm } from "@/src/modules/purchasing-lists/components";

export default function NewPurchasingListPage() { return <div className="mx-auto max-w-4xl space-y-6"><header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/purchasing-lists">← Списки закупок</Link><h1 className="mt-2 text-2xl font-semibold">Новый список закупок</h1><p className="mt-1 text-sm text-zinc-500">Товары можно добавить после создания из каталога, корзины или истории заказов.</p></header><PurchasingListCreateForm /></div>; }
