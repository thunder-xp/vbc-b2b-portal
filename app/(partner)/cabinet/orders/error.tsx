"use client";

export default function OrdersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-5">
      <h1 className="font-semibold text-rose-950">Не удалось открыть заказы</h1>
      <p className="mt-2 text-sm text-rose-800">Обновите данные или повторите попытку позже.</p>
      <button className="mt-4 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-900" onClick={reset} type="button">Повторить</button>
    </div>
  );
}
