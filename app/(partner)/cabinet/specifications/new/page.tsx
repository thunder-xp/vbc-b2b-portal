import Link from "next/link";

import { SpecificationForm } from "@/src/modules/project-specifications/components";

export default function NewProjectSpecificationPage() {
  return <div className="mx-auto max-w-4xl space-y-6"><header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-medium text-emerald-700" href="/cabinet/specifications">← Спецификации</Link><h1 className="mt-2 text-2xl font-semibold">Новая проектная спецификация</h1><p className="mt-1 text-sm text-zinc-500">Укажите объект, затем добавьте оборудование из актуального каталога.</p></header><section className="rounded-lg border border-zinc-200 bg-white p-6"><SpecificationForm /></section></div>;
}
