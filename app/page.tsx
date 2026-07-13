import {
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  FileText,
  PackageSearch,
  Warehouse,
} from "lucide-react";
import Link from "next/link";

const capabilities = [
  { label: "Каталог B2B", icon: PackageSearch },
  { label: "Партнёрские цены", icon: BadgeDollarSign },
  { label: "Наличие и поступления", icon: Warehouse },
  { label: "Проектные спецификации", icon: ClipboardList },
  { label: "Запросы на резерв", icon: Boxes },
  { label: "Документы", icon: FileText },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Партнёрская платформа
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
              Безопасный B2B-кабинет для партнёров: каталог, индивидуальные цены,
              наличие, документы, спецификации и запросы на резерв.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800" href="/auth/sign-in">
                Войти
              </Link>
              <Link className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-900 hover:border-emerald-700" href="/auth/register">
                Стать партнёром
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Возможности партнёра</h2>
            <div className="mt-5 grid gap-3">
              {capabilities.map(({ icon: Icon, label }) => (
                <div className="flex items-center gap-3 rounded-md bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-800" key={label}>
                  <Icon aria-hidden="true" className="size-4 text-emerald-700" data-testid="capability-icon" strokeWidth={1.75} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
