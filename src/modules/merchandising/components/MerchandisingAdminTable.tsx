"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { manageMerchandisingAction } from "../actions/merchandising.actions";
import type {
  AdminMerchandisingPage,
  MerchandisingLabelCode,
  MerchandisingOperation,
} from "../types";
import { ProductThumbnail } from "../../catalog/components/ProductThumbnail";
import { localDateTimeToUtc } from "../services/merchandising-datetime";

export function MerchandisingAdminTable({
  page,
  canManage,
}: {
  page: AdminMerchandisingPage;
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [labelCode, setLabelCode] = useState<MerchandisingLabelCode>("TOP");
  const [operation, setOperation] =
    useState<MerchandisingOperation>("assign");
  const [priority, setPriority] = useState(100);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const normalizedStartsAt = startsAt
      ? localDateTimeToUtc(startsAt)
      : null;
    const normalizedEndsAt = endsAt ? localDateTimeToUtc(endsAt) : null;
    if ((startsAt && !normalizedStartsAt) || (endsAt && !normalizedEndsAt)) {
      setMessage("Проверьте дату и время публикации.");
      return;
    }

    startTransition(async () => {
      const result = await manageMerchandisingAction({
        requestId: crypto.randomUUID(),
        operation,
        productIds: selected,
        labelCode,
        startsAt: normalizedStartsAt,
        endsAt: normalizedEndsAt,
        priority,
        reason,
      });
      setMessage(result.message);
      if (result.success) {
        setSelected([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <section className="grid gap-3 border-y border-zinc-200 bg-white py-4 lg:grid-cols-[auto_auto_110px_170px_170px_1fr_auto]">
          <label className="text-xs font-medium text-zinc-600">
            Действие
            <select
              className="mt-1 block h-10 rounded-md border border-zinc-300 px-2"
              onChange={(event) =>
                setOperation(event.target.value as MerchandisingOperation)
              }
              value={operation}
            >
              <option value="assign">Назначить и опубликовать</option>
              <option value="revoke">Отозвать</option>
              <option value="hide">Скрыть назначенную</option>
              <option value="show">Показать или опубликовать</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Метка
            <select
              className="mt-1 block h-10 rounded-md border border-zinc-300 px-2"
              onChange={(event) =>
                setLabelCode(event.target.value as MerchandisingLabelCode)
              }
              value={labelCode}
            >
              <option value="NEW">Новинка</option>
              <option value="TOP">Популярный</option>
              <option value="HOT">Горячая цена</option>
              <option value="SPECIAL_OFFER">Спецпредложение Retail</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Приоритет
            <input
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-2"
              max={1000}
              min={0}
              onChange={(event) => setPriority(Number(event.target.value))}
              type="number"
              value={priority}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Начало
            <input
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-2"
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Окончание
            <input
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-2"
              onChange={(event) => setEndsAt(event.target.value)}
              type="datetime-local"
              value={endsAt}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Причина
            <input
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Обоснование редакционного решения"
              value={reason}
            />
          </label>
          <button
            className="self-end rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            disabled={pending || selected.length === 0 || reason.trim().length < 3}
            onClick={submit}
            type="button"
          >
            {pending ? "Сохранение..." : `Применить (${selected.length})`}
          </button>
          <p className="text-xs text-zinc-500 lg:col-span-full">
            Время браузера. Перед сохранением значения преобразуются в UTC.
          </p>
        </section>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto border-y border-zinc-200">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              {canManage ? <th className="p-3"><input aria-label="Выбрать все товары на странице" checked={page.items.length > 0 && page.items.every((product) => selected.includes(product.id))} onChange={(event) => setSelected(event.target.checked ? page.items.map((product) => product.id) : [])} type="checkbox" /></th> : null}
              <th className="p-3">Товар</th>
              <th className="p-3">Категория / бренд</th>
              <th className="p-3">Публикация</th>
              <th className="p-3">Коммерческие данные</th>
              <th className="p-3">Метки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {page.items.map((product) => (
              <tr key={product.id}>
                {canManage ? (
                  <td className="p-3">
                    <input
                      aria-label={`Выбрать ${product.sku}`}
                      checked={selected.includes(product.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, product.id]
                            : current.filter((id) => id !== product.id),
                        )
                      }
                      type="checkbox"
                    />
                  </td>
                ) : null}
                <td className="p-3">
                  <div className="flex min-w-56 items-center gap-3">
                    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-100">
                      {product.imageUrl ? <ProductThumbnail alt="" className="object-contain p-1" sizes="48px" src={product.imageUrl} /> : <span className="text-xs text-zinc-400">Нет фото</span>}
                    </div>
                    <div><p className="font-semibold text-zinc-950">{product.name}</p><p className="text-xs text-zinc-500">SKU {product.sku}</p></div>
                  </div>
                </td>
                <td className="p-3 text-zinc-600">
                  {product.categoryName ?? "Без категории"}
                  <br />
                  {product.brandName ?? "Без бренда"}
                </td>
                <td className="p-3">
                  {product.isPublished ? "Опубликован" : "Неактивен"}
                </td>
                <td className="p-3 text-xs text-zinc-600">
                  Партнёрская цена: {product.hasPartnerPrice ? "есть" : "нет"}
                  <br />
                  Розница: {product.hasRetailPrice ? "есть" : "нет"}
                  <br />
                  Наличие: {stockLabel(product.stockState)}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {product.assignments.length ? (
                      product.assignments.map((assignment) => (
                        <span
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          key={assignment.id}
                        >
                          <span className="font-semibold">{labelText(assignment.labelCode)}</span>
                          <span className="block text-zinc-500">
                            {sourceText(assignment.source)} · приоритет {assignment.priority}
                          </span>
                          <span className="block text-zinc-500">
                            {formatValidity(assignment.startsAt, assignment.endsAt)}
                          </span>
                          <span className="block text-zinc-500">
                            {assignment.updatedBy ? `Редактор: ${assignment.updatedBy}` : "Редактор не указан"}
                            {!assignment.isCuratedVisible ? " · скрыто" : ""}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-400">Нет меток</span>
                    )}
                  </div>
                  {product.assignments[0] ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Изменено:{" "}
                      {new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(product.assignments[0].updatedAt))}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sourceText(source: AdminMerchandisingPage["items"][number]["assignments"][number]["source"]): string {
  if (source === "one_c") return "Сигнал 1С";
  if (source === "analytics_recommendation") return "Рекомендация";
  return "Ручная";
}

function formatValidity(startsAt: string, endsAt: string | null): string {
  const format = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `${format.format(new Date(startsAt))} — ${endsAt ? format.format(new Date(endsAt)) : "без срока"} (локальное время)`;
}

function labelText(code: MerchandisingLabelCode): string {
  if (code === "SPECIAL_OFFER") return "Спецпредложение Retail";
  return code === "NEW"
    ? "Новинка"
    : code === "TOP"
      ? "Популярный"
      : "Горячая цена";
}

function stockLabel(
  state: AdminMerchandisingPage["items"][number]["stockState"],
): string {
  if (state === "in_stock") return "в наличии";
  if (state === "expected") return "к поступлению";
  return "нет";
}
