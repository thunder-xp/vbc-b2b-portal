"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createProjectSpecificationAction, updateProjectSpecificationAction } from "../actions";

export function SpecificationForm({ specification }: { specification?: { id: string; projectName: string; customerSiteName: string; description: string | null } }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const input = {
        projectName: String(formData.get("projectName") ?? ""),
        customerSiteName: String(formData.get("customerSiteName") ?? ""),
        description: String(formData.get("description") ?? ""),
      };
      startTransition(async () => {
        if (specification) {
          const result = await updateProjectSpecificationAction(specification.id, input);
          setMessage(result.message);
          if (result.success) router.refresh();
        } else {
          const result = await createProjectSpecificationAction(input);
          setMessage(result.message);
          if (result.success) router.push(`/cabinet/specifications/${result.data.id}`);
        }
      });
    }}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field defaultValue={specification?.projectName} label="Название проекта" name="projectName" placeholder="Видеонаблюдение для склада" required />
        <Field defaultValue={specification?.customerSiteName} label="Заказчик / объект" name="customerSiteName" placeholder="Склад на ул. Индустриальной" required />
      </div>
      <label className="block text-sm font-medium text-zinc-800">Описание<textarea className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-emerald-600" defaultValue={specification?.description ?? ""} maxLength={2000} name="description" placeholder="Дополнительные требования к объекту" /></label>
      <div className="flex items-center gap-3">
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isPending} type="submit">{isPending ? "Сохранение..." : specification ? "Сохранить черновик" : "Создать спецификацию"}</button>
        {message && <p className="text-sm text-zinc-600" role="status">{message}</p>}
      </div>
    </form>
  );
}

function Field({ defaultValue, label, name, placeholder, required }: { defaultValue?: string; label: string; name: string; placeholder: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-zinc-800">{label}<input className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-emerald-600" defaultValue={defaultValue} maxLength={200} name={name} placeholder={placeholder} required={required} /></label>;
}
