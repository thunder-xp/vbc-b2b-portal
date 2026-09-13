"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, ImagePlus, Pencil, Store, X } from "lucide-react";

import { ProductThumbnail } from "../catalog/components/ProductThumbnail";
import { manageMerchandisingAction } from "../merchandising/actions/merchandising.actions";
import type { MerchandisingOperation } from "../merchandising/types";
import { localDateTimeToUtc } from "../merchandising/services/merchandising-datetime";
import { setCatalogProductVisibilityAction } from "./actions";
import type {
  AdminCatalogProduct,
  CatalogManagementFilter,
  CatalogManagementPage,
  CatalogQualityFlag,
} from "./types";

const FILTERS: Array<{ key: CatalogManagementFilter; label: string }> = [
  { key: "ALL", label: "Все" },
  { key: "PUBLISHED", label: "Опубликовано" },
  { key: "HIDDEN", label: "Скрыто" },
  { key: "MISSING_IMAGE", label: "Без фото" },
  { key: "MISSING_CATEGORY", label: "Без категории" },
  { key: "MISSING_BRAND", label: "Без бренда" },
  { key: "MISSING_PRICE", label: "Без цены" },
  { key: "STOCK_UNKNOWN", label: "Неизвестный остаток" },
  { key: "NEEDS_ATTENTION", label: "Требуют внимания" },
];

const ISSUE_LABELS: Record<CatalogQualityFlag, string> = {
  MISSING_IMAGE: "Без фото",
  MISSING_CATEGORY: "Без категории",
  MISSING_BRAND: "Без бренда",
  MISSING_PRICE: "Без цены",
  STOCK_UNKNOWN: "Остаток неизвестен",
  HIDDEN_BY_PORTAL: "Скрыт порталом",
  INACTIVE_IN_1C: "Неактивен в 1С",
};

export function CatalogManagementWorkspace({
  data,
  activeFilter,
  search,
  canManage,
  firebaseConfigured,
}: {
  data: CatalogManagementPage;
  activeFilter: CatalogManagementFilter;
  search: string;
  canManage: boolean;
  firebaseConfigured: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<AdminCatalogProduct | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const allSelected = data.items.length > 0 && data.items.every((product) => selected.includes(product.id));

  function filterHref(filter: CatalogManagementFilter): string {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("filter", filter);
    if (search) params.set("q", search);
    const query = params.toString();
    return query ? `/admin/catalog?${query}` : "/admin/catalog";
  }

  function toggleVisibility(product: AdminCatalogProduct) {
    if (!canManage) return;
    const nextVisible = !product.isVisible;
    const reason = nextVisible
      ? "Повторная публикация администратором"
      : window.prompt("Причина скрытия товара (не менее 3 символов):", "Карточка требует исправления")?.trim();
    if (!reason) return;
    startTransition(async () => {
      const result = await setCatalogProductVisibilityAction({
        productId: product.id,
        visible: nextVisible,
        reason,
        correlationId: crypto.randomUUID(),
      });
      setMessage(result.message);
      if (result.success) {
        setDetail(null);
        router.refresh();
      }
    });
  }

  async function upload(product: AdminCatalogProduct, file: File | undefined) {
    if (!file || !canManage || !firebaseConfigured) return;
    setMessage("Проверка и загрузка изображения…");
    const form = new FormData();
    form.set("image", file);
    try {
      const response = await fetch(`/api/admin/catalog/products/${product.id}/image`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json() as {
        success?: boolean;
        data?: { correlationId?: string };
        correlationId?: string;
        errorCode?: string;
      };
      if (!response.ok || !payload.success) {
        setMessage(`Загрузка не завершена: ${payload.errorCode ?? "UNKNOWN"}. Код: ${payload.correlationId ?? "—"}.`);
        return;
      }
      setMessage(`Фото подтверждено в 1С и обновлено в каталоге. Код: ${payload.data?.correlationId ?? "—"}.`);
      setDetail(null);
      router.refresh();
    } catch {
      setMessage("Загрузка не завершена: сеть недоступна.");
    }
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Фильтры качества каталога" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {FILTERS.map((filter) => (
          <Link
            className={`rounded-lg border px-3 py-2 text-sm transition ${activeFilter === filter.key ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"}`}
            href={filterHref(filter.key)}
            key={filter.key}
          >
            <span className="block text-xs text-zinc-500">{filter.label}</span>
            <strong className="text-lg tabular-nums">{data.counters[filter.key as keyof typeof data.counters] ?? 0}</strong>
          </Link>
        ))}
      </nav>

      {!firebaseConfigured ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Загрузка фото недоступна: выделенная серверная учётная запись Firebase ещё не настроена.
        </p>
      ) : null}
      {message ? <p aria-live="polite" className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">{message}</p> : null}
      {data.recentImageFailures.length ? (
        <section aria-label="Ошибки загрузки фото" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h2 className="text-sm font-semibold text-rose-950">Требуют повторной проверки</h2>
          <ul className="mt-2 space-y-1 text-xs text-rose-900">
            {data.recentImageFailures.map((failure) => (
              <li key={failure.correlationId}>
                {failure.productRef} · {failure.stage} · {failure.safeErrorCode ?? "UNKNOWN"} · очистка {failure.cleanupStatus} · {failure.correlationId}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage && selected.length ? (
        <MerchandisingSelectionBar
          count={selected.length}
          onCompleted={(text) => {
            setMessage(text);
            setSelected([]);
            router.refresh();
          }}
          productIds={selected}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              {canManage ? <th className="w-12 p-3"><input aria-label="Выбрать все товары на странице" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? data.items.map((product) => product.id) : [])} type="checkbox" /></th> : null}
              <th className="w-20 p-3">Фото</th>
              <th className="p-3">Товар</th>
              <th className="p-3">Категория / бренд</th>
              <th className="p-3">Цена / остатки</th>
              <th className="p-3">Публикация</th>
              <th className="p-3">Недочёты</th>
              <th className="w-56 p-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {data.items.map((product) => (
              <tr className="align-middle" key={product.id}>
                {canManage ? <td className="p-3"><input aria-label={`Выбрать ${product.sku}`} checked={selected.includes(product.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, product.id])] : current.filter((id) => id !== product.id))} type="checkbox" /></td> : null}
                <td className="p-3">
                  <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
                    {product.imageUrl ? <ProductThumbnail alt="" className="object-contain p-1" sizes="56px" src={product.imageUrl} /> : <ImagePlus aria-hidden className="size-5 text-zinc-400" />}
                  </div>
                </td>
                <td className="p-3"><p className="font-semibold text-zinc-950">{product.name}</p><p className="text-xs text-zinc-500">SKU {product.sku}</p><p className="mt-1 font-mono text-[11px] text-zinc-400">{product.external1cId}</p></td>
                <td className="p-3 text-zinc-700"><p>{product.categoryName ?? "Без категории"}</p><p className="text-xs text-zinc-500">{product.brandName ?? "Без бренда"}</p></td>
                <td className="p-3"><p>Цена: {product.hasPartnerPrice ? "есть" : "нет"}</p><p className="text-xs text-zinc-500">{stockLabel(product)}</p></td>
                <td className="p-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${product.isPublished ? "bg-emerald-100 text-emerald-800" : product.isVisible ? "bg-amber-100 text-amber-900" : "bg-zinc-200 text-zinc-700"}`}>{product.isPublished ? "Опубликован" : product.isVisible ? "Неактивен в 1С" : "Скрыт"}</span>
                  {product.assignments.length ? (
                    <div aria-label="Редакционные метки" className="mt-2 flex max-w-52 flex-wrap gap-1">
                      {product.assignments.map((assignment) => (
                        <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600" key={assignment.id} title={`Приоритет ${assignment.priority}`}>
                          {assignmentLabel(assignment.labelCode)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="p-3"><div className="flex max-w-64 flex-wrap gap-1">{product.issues.length ? product.issues.map((issue) => <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" key={issue}>{ISSUE_LABELS[issue]}</span>) : <span className="text-xs text-emerald-700">Без замечаний</span>}</div></td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage ? <ImageUploadControl disabled={!firebaseConfigured || pending} label={product.imageOriginalUrl ? "Заменить фото" : "Загрузить фото"} onFile={(file) => upload(product, file)} /> : null}
                    {canManage ? <button className="inline-flex min-h-11 items-center gap-1 rounded-md border border-zinc-300 px-3 text-xs font-semibold disabled:opacity-50" disabled={pending} onClick={() => toggleVisibility(product)} type="button">{product.isVisible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}{product.isVisible ? "Скрыть" : "Опубликовать"}</button> : null}
                    <button className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300" onClick={() => setDetail(product)} title="Открыть карточку управления" type="button"><Pencil aria-hidden className="size-4" /><span className="sr-only">Открыть карточку {product.sku}</span></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length ? <p className="p-8 text-center text-sm text-zinc-500">Товары по выбранному фильтру не найдены.</p> : null}
      </div>

      {detail ? (
        <ProductDetailDialog
          canManage={canManage}
          firebaseConfigured={firebaseConfigured}
          onClose={() => setDetail(null)}
          onToggle={() => toggleVisibility(detail)}
          onUpload={(file) => upload(detail, file)}
          product={detail}
        />
      ) : null}
    </div>
  );
}

function ImageUploadControl({ disabled, label, onFile }: { disabled: boolean; label: string; onFile: (file?: File) => void }) {
  const id = useMemo(() => crypto.randomUUID(), []);
  return <><input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled} id={id} onChange={(event) => onFile(event.target.files?.[0])} type="file" /><label className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white ${disabled ? "pointer-events-none opacity-50" : ""}`} htmlFor={id}><ImagePlus aria-hidden className="size-4" />{label}</label></>;
}

function ProductDetailDialog({ product, canManage, firebaseConfigured, onClose, onToggle, onUpload }: { product: AdminCatalogProduct; canManage: boolean; firebaseConfigured: boolean; onClose: () => void; onToggle: () => void; onUpload: (file?: File) => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog"><section className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-700">Карточка товара</p><h2 className="mt-1 text-xl font-semibold">{product.name}</h2></div><button className="flex size-11 items-center justify-center rounded-md border" onClick={onClose} title="Закрыть" type="button"><X aria-hidden className="size-5" /><span className="sr-only">Закрыть</span></button></div><div className="relative mt-5 flex aspect-square max-h-72 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">{product.imageUrl ? <ProductThumbnail alt={product.name} className="object-contain p-4" sizes="448px" src={product.imageUrl} /> : <ImagePlus className="size-12 text-zinc-300" />}</div><dl className="mt-6 grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-zinc-500">SKU</dt><dd>{product.sku}</dd><dt className="text-zinc-500">Ref_Key</dt><dd className="break-all font-mono text-xs">{product.external1cId}</dd><dt className="text-zinc-500">Категория</dt><dd>{product.categoryName ?? "Без категории"}</dd><dt className="text-zinc-500">Бренд</dt><dd>{product.brandName ?? "Без бренда"}</dd><dt className="text-zinc-500">Цена</dt><dd>{product.hasPartnerPrice ? "Присутствует" : "Отсутствует"}</dd><dt className="text-zinc-500">Остаток</dt><dd>{stockLabel(product)}</dd><dt className="text-zinc-500">Публикация</dt><dd>{product.isPublished ? "Опубликован" : product.isVisible ? "Ожидает активности 1С" : "Скрыт порталом"}</dd><dt className="text-zinc-500">URL фото</dt><dd className="break-all text-xs">{product.imageOriginalUrl ?? "Не задан"}</dd></dl><div className="mt-5"><p className="text-xs font-semibold uppercase text-zinc-500">Редакционные метки</p><div className="mt-2 flex flex-wrap gap-1">{product.assignments.length ? product.assignments.map((assignment) => <span className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700" key={assignment.id}>{assignmentLabel(assignment.labelCode)} · приоритет {assignment.priority}</span>) : <span className="text-sm text-zinc-500">Нет</span>}</div></div><div className="mt-5"><p className="text-xs font-semibold uppercase text-zinc-500">Недочёты</p><div className="mt-2 flex flex-wrap gap-1">{product.issues.length ? product.issues.map((issue) => <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" key={issue}>{ISSUE_LABELS[issue]}</span>) : <span className="text-sm text-emerald-700">Нет</span>}</div></div>{canManage ? <div className="mt-6 flex flex-wrap gap-2"><ImageUploadControl disabled={!firebaseConfigured} label={product.imageOriginalUrl ? "Заменить фото" : "Загрузить фото"} onFile={onUpload} /><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold" onClick={onToggle} type="button">{product.isVisible ? <EyeOff className="size-4" /> : <Store className="size-4" />}{product.isVisible ? "Скрыть" : "Опубликовать"}</button></div> : null}</section></div>;
}

function MerchandisingSelectionBar({ productIds, count, onCompleted }: { productIds: string[]; count: number; onCompleted: (message: string) => void }) {
  const [operation, setOperation] = useState<MerchandisingOperation>("assign");
  const [priority, setPriority] = useState(100);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  function submit() {
    const start = startsAt ? localDateTimeToUtc(startsAt) : null;
    const end = endsAt ? localDateTimeToUtc(endsAt) : null;
    if ((startsAt && !start) || (endsAt && !end)) return;
    startTransition(async () => {
      const result = await manageMerchandisingAction({ requestId: crypto.randomUUID(), operation, productIds, labelCode: "SPECIAL_OFFER", startsAt: start, endsAt: end, priority, reason });
      if (result.success) onCompleted(result.message);
    });
  }
  return <section className="sticky top-2 z-20 grid gap-2 rounded-xl border border-emerald-200 bg-white p-3 shadow-lg lg:grid-cols-[auto_170px_90px_170px_170px_1fr_auto]"><p className="self-center text-sm font-semibold">Выбрано: {count}</p><select aria-label="Действие витрины" className="h-11 rounded-md border px-2" onChange={(event) => setOperation(event.target.value as MerchandisingOperation)} value={operation}><option value="assign">Назначить спецпредложение</option><option value="revoke">Отозвать</option><option value="hide">Скрыть метку</option><option value="show">Показать метку</option></select><input aria-label="Приоритет" className="h-11 rounded-md border px-2" max={1000} min={0} onChange={(event) => setPriority(Number(event.target.value))} type="number" value={priority} /><input aria-label="Начало публикации" className="h-11 rounded-md border px-2" onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} /><input aria-label="Окончание публикации" className="h-11 rounded-md border px-2" onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" value={endsAt} /><input aria-label="Причина" className="h-11 rounded-md border px-3" maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Причина изменения витрины" value={reason} /><button className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || reason.trim().length < 3} onClick={submit} type="button">Применить</button></section>;
}

function stockLabel(product: AdminCatalogProduct): string {
  if (product.stockState === "unknown") return "Остаток неизвестен";
  if (product.stockState === "zero") return "Нет в наличии (0)";
  return `В наличии${product.availableQuantity === null ? "" : `: ${product.availableQuantity}`}`;
}

function assignmentLabel(code: string): string {
  if (code === "SPECIAL_OFFER") return "Спецпредложение";
  if (code === "NEW") return "Новинка";
  if (code === "TOP") return "Популярный";
  if (code === "HOT") return "Горячая цена";
  return code;
}
