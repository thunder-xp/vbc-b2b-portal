"use client";

import { AlertCircle } from "lucide-react";

import { cabinetPage, cabinetPrimaryAction, cabinetSecondaryAction, cabinetSurface } from "./WorkspaceHeader";

export function CabinetErrorState({ homeHref, reset, ro }: { homeHref: string; reset: () => void; ro: boolean }) {
  return <main className={cabinetPage}>
    <section className={`p-5 sm:p-6 ${cabinetSurface}`}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700"><AlertCircle aria-hidden className="size-5" /></span>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{ro ? "Pagina nu a putut fi încărcată" : "Не удалось загрузить страницу"}</h1>
      <p className="mt-1 max-w-xl text-sm leading-5 text-zinc-600">{ro ? "Datele nu au fost modificate. Încercați din nou sau reveniți la pagina principală." : "Данные не изменены. Попробуйте ещё раз или вернитесь на главную страницу кабинета."}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button className={cabinetPrimaryAction} onClick={reset} type="button">{ro ? "Încercați din nou" : "Попробовать снова"}</button>
        <a className={cabinetSecondaryAction} href={homeHref}>{ro ? "Pagina principală" : "Главная кабинета"}</a>
      </div>
    </section>
  </main>;
}
