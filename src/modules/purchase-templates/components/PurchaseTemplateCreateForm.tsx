"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPurchaseTemplateAction } from "../actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";

export function PurchaseTemplateCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <form className="max-w-2xl space-y-5" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await createPurchaseTemplateAction({ name: String(data.get("name")), description: String(data.get("description")), visibility: String(data.get("visibility")) as "private" | "company", requestKey });
        if (result.success) { recordBehaviorInteraction({ eventName: "purchase_template_created", route: "/cabinet/purchase-templates/new", sourceSurface: "purchase_template_create" }); router.push(`/cabinet/purchase-templates/${result.data.id}`); }
        else setError("Не удалось создать шаблон. Проверьте данные и доступ.");
      });
    }}>
      <label className="block text-sm font-medium">Название<input autoFocus className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" maxLength={120} name="name" required /></label>
      <label className="block text-sm font-medium">Описание<textarea className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2" maxLength={1000} name="description" /></label>
      <fieldset><legend className="text-sm font-medium">Доступ</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><Visibility defaultChecked description="Виден только вам." title="Личный" value="private" /><Visibility description="Виден коллегам с доступом к закупкам." title="Для компании" value="company" /></div></fieldset>
      {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
      <button className="min-h-11 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending} type="submit">{pending ? "Создание..." : "Создать шаблон"}</button>
    </form>
  );
}

function Visibility({ value, title, description, defaultChecked = false }: { value: string; title: string; description: string; defaultChecked?: boolean }) {
  return <label className="flex min-h-16 cursor-pointer gap-3 rounded-md border border-zinc-200 p-3"><input className="mt-1 accent-emerald-700" defaultChecked={defaultChecked} name="visibility" type="radio" value={value} /><span><strong className="block text-sm">{title}</strong><span className="text-xs text-zinc-500">{description}</span></span></label>;
}
