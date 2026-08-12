"use client";

export default function PublicCatalogError({ reset }: { reset: () => void }) {
  return <main className="grid min-h-[60vh] place-items-center px-4"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">Каталог временно недоступен</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Не удалось загрузить опубликованные данные. Повторите попытку через несколько минут.</p><button className="mt-5 min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white" onClick={reset}>Повторить</button></div></main>;
}
