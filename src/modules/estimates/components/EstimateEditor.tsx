"use client";

import { Archive, Check, Copy, Eye, FileDown, MoreHorizontal, PackagePlus, Save, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addEstimateCustomLineAction,
  addEstimateProductsAction,
  addEstimateServiceAction,
  archiveEstimateAction,
  removeEstimateLineAction,
  saveEstimateAction,
  searchEstimateProductsAction,
  updateEstimateLineAction,
} from "../actions";
import type { EstimateDetailDto, EstimateProductPickerDto, EstimateServiceDto } from "../services";
import type { EstimateUnit } from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";

const units: Array<{ value: EstimateUnit; label: string }> = [
  { value: "pcs", label: "шт." },
  { value: "hour", label: "час" },
  { value: "meter", label: "метр" },
  { value: "set", label: "комплект" },
  { value: "visit", label: "выезд" },
  { value: "service", label: "услуга" },
];
const editorInputClass = "mt-1.5 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const lineInputClass = "mt-1.5 h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const toolbarPrimaryClass = "inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50";
const toolbarSecondaryClass = "inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-45";
const toolbarIconClass = "inline-flex size-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-45";
const lineActionClass = "inline-flex size-9 items-center justify-center rounded-md outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50";

export function EstimateEditor({ initialEstimate, services }: { initialEstimate: EstimateDetailDto; services: EstimateServiceDto[] }) {
  const router = useRouter();
  const [estimate, setEstimate] = useState(initialEstimate);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isDraft = estimate.status === "draft";

  const applyMutation = (mutation: () => ReturnType<typeof saveEstimateAction>) => {
    startTransition(async () => {
      const result = await mutation();
      setMessage(result.message);
      if (result.success) setEstimate(result.data);
    });
  };

  return (
    <div className="space-y-5">
      <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase text-zinc-500">{estimate.estimateNumber}</p>
              <EstimateStatusBadge status={estimate.status} />
              <span className="text-xs text-zinc-500">Версия {estimate.revision}</span>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-600">{pending ? "Сохранение..." : `Сохранено ${formatDateTime(estimate.updatedAt)}`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={toolbarPrimaryClass} disabled={pending || !isDraft} form="estimate-metadata-form" type="submit"><Save className="size-4" />Сохранить</button>
            <DisabledToolbarButton icon={Eye} label="Предпросмотр" />
            <DisabledToolbarButton icon={FileDown} label="PDF" />
            <DisabledToolbarButton icon={Copy} label="Дублировать" />
            <DisabledToolbarButton icon={ShoppingCart} label="В корзину" />
            <button aria-label="Другие действия" className={toolbarIconClass} disabled title="Доступно в следующих этапах" type="button"><MoreHorizontal className="size-4" /></button>
          </div>
        </div>
      </header>

      {message && <p aria-live="polite" className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-zinc-700">{message}</p>}

      <form
        className="grid gap-4 border-b border-zinc-200 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]"
        id="estimate-metadata-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          applyMutation(() => saveEstimateAction(estimate.id, {
            expectedRevision: estimate.revision,
            name: String(data.get("name") ?? ""),
            customerName: String(data.get("customerName") ?? ""),
            projectName: String(data.get("projectName") ?? ""),
            validityDays: Number(data.get("validityDays")),
          }));
        }}
      >
        <label className="text-sm font-medium text-zinc-700">Название<input className={editorInputClass} defaultValue={estimate.name} disabled={!isDraft} maxLength={200} name="name" required /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">Заказчик<input className={editorInputClass} defaultValue={estimate.customerName ?? ""} disabled={!isDraft} maxLength={200} name="customerName" /></label>
          <label className="text-sm font-medium text-zinc-700">Проект / объект<input className={editorInputClass} defaultValue={estimate.projectName ?? ""} disabled={!isDraft} maxLength={200} name="projectName" /></label>
        </div>
        <label className="text-sm font-medium text-zinc-700">Действует, дней<input className={editorInputClass} defaultValue={estimate.validityDays} disabled={!isDraft} max={365} min={1} name="validityDays" required type="number" /></label>
      </form>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 space-y-5">
          <section className="overflow-hidden border-y border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div><h2 className="font-semibold text-zinc-950">Позиции сметы</h2><p className="text-xs text-zinc-500">{estimate.itemCount} позиций</p></div>
              <span className="text-xs text-zinc-500">Явное сохранение без перезагрузки страницы</span>
            </div>
            {estimate.lines.length ? (
              <div className="divide-y divide-zinc-100">
                <div className="hidden grid-cols-[2.5rem_minmax(14rem,1fr)_5rem_6rem_8rem_8rem_5rem] gap-3 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase text-zinc-500 md:grid">
                  <span>№</span><span>Описание</span><span>Кол-во</span><span>Ед.</span><span>Опорная</span><span>Продажа</span><span />
                </div>
                {estimate.lines.map((line) => (
                  <form
                    className="grid gap-3 px-4 py-4 md:grid-cols-[2.5rem_minmax(14rem,1fr)_5rem_6rem_8rem_8rem_5rem] md:items-end"
                    key={`${line.id}-${estimate.revision}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      applyMutation(() => updateEstimateLineAction(estimate.id, line.id, {
                        expectedRevision: estimate.revision,
                        description: String(data.get("description") ?? ""),
                        quantity: Number(data.get("quantity")),
                        unit: String(data.get("unit")) as EstimateUnit,
                        sellingUnitPrice: Number(data.get("sellingUnitPrice")),
                      }));
                    }}
                  >
                    <span className="text-sm font-semibold text-zinc-500">{line.position}</span>
                    <label className="text-xs font-medium text-zinc-500">Описание<input className={lineInputClass} defaultValue={line.description} disabled={!isDraft} maxLength={2000} name="description" required />{line.sku && <span className="mt-1 block text-[11px] text-zinc-500">SKU {line.sku}</span>}</label>
                    <label className="text-xs font-medium text-zinc-500">Кол-во<input className={lineInputClass} defaultValue={line.quantity} disabled={!isDraft} max={999999} min="0.001" name="quantity" required step="0.001" type="number" /></label>
                    <label className="text-xs font-medium text-zinc-500">Ед.<select className={lineInputClass} defaultValue={line.unit} disabled={!isDraft} name="unit">{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
                    <div><p className="text-xs font-medium text-zinc-500">Опорная</p><p className="mt-2 text-sm text-zinc-700">{line.sourcePrice ?? "—"}</p></div>
                    <label className="text-xs font-medium text-zinc-500">Продажа<input className={lineInputClass} defaultValue={line.sellingUnitPrice ?? ""} disabled={!isDraft} min="0" name="sellingUnitPrice" required step="0.01" type="number" /><span className="mt-1 block text-[11px] text-zinc-500">{line.lineTotal ?? "Цена не задана"}</span></label>
                    <div className="flex gap-1">
                      <button aria-label="Сохранить позицию" className={`${lineActionClass} text-emerald-700`} disabled={pending || !isDraft} type="submit"><Check className="size-4" /></button>
                      <button aria-label="Удалить позицию" className={`${lineActionClass} text-red-700`} disabled={pending || !isDraft} onClick={() => applyMutation(() => removeEstimateLineAction(estimate.id, line.id, estimate.revision))} type="button"><Trash2 className="size-4" /></button>
                    </div>
                  </form>
                ))}
              </div>
            ) : <p className="px-5 py-12 text-center text-sm text-zinc-500">Добавьте оборудование, работу или произвольную позицию.</p>}
          </section>

          {isDraft && <AddContentPanel estimate={estimate} onMessage={setMessage} onResult={(next, nextMessage) => { setEstimate(next); setMessage(nextMessage); }} pending={pending} services={services} startTransition={startTransition} />}
        </main>

        <aside className="sticky top-24 border-y border-zinc-200 bg-white px-5 py-5">
          <p className="text-xs font-semibold uppercase text-zinc-500">Итого</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">{estimate.total}</p>
          <p className="mt-1 text-sm text-zinc-500">Валюта: {estimate.currencyCode}</p>
          {estimate.hasIncompletePricing && <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-900">Для части позиций не задана цена продажи. Итог пока неполный.</p>}
          <div className="mt-5 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
            <p>Скидки, наценка, маржа и НДС появятся в следующем коммерческом этапе.</p>
          </div>
          {isDraft && <button
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const result = await archiveEstimateAction(estimate.id, estimate.revision);
              setMessage(result.message);
              if (result.success) router.push("/cabinet/estimates");
            })}
            type="button"
          ><Archive className="size-4" />В архив</button>}
        </aside>
      </div>
    </div>
  );
}

function AddContentPanel({ estimate, onMessage, onResult, pending, services, startTransition }: {
  estimate: EstimateDetailDto;
  onMessage: (message: string) => void;
  onResult: (next: EstimateDetailDto, message: string) => void;
  pending: boolean;
  services: EstimateServiceDto[];
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [tab, setTab] = useState<"product" | "service" | "custom">("product");
  const submit = (operation: () => ReturnType<typeof addEstimateProductsAction>) => startTransition(async () => {
    const result = await operation();
    if (result.success) onResult(result.data, result.message);
    else onMessage(result.message);
  });

  return (
    <section className="border-y border-zinc-200 bg-white">
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 pt-3" role="tablist">
        {(["product", "service", "custom"] as const).map((value) => (
          <button aria-selected={tab === value} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === value ? "border-emerald-600 text-emerald-800" : "border-transparent text-zinc-500"}`} key={value} onClick={() => setTab(value)} role="tab" type="button">
            {value === "product" ? "Товары" : value === "service" ? "Работы и услуги" : "Своя позиция"}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "product" && <ProductPicker estimate={estimate} pending={pending} submit={submit} />}
        {tab === "service" && <ServiceForm estimate={estimate} pending={pending} services={services} submit={submit} />}
        {tab === "custom" && <CustomLineForm estimate={estimate} pending={pending} submit={submit} />}
      </div>
    </section>
  );
}

function ProductPicker({ estimate, pending, submit }: { estimate: EstimateDetailDto; pending: boolean; submit: (operation: () => ReturnType<typeof addEstimateProductsAction>) => void }) {
  const [products, setProducts] = useState<EstimateProductPickerDto>({ products: [], categories: [], brands: [] });
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchPending, startSearchTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto]" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startSearchTransition(async () => {
          const result = await searchEstimateProductsAction({
            search: String(data.get("productSearch") ?? ""),
            categoryId: String(data.get("categoryId") ?? ""),
            brandId: String(data.get("brandId") ?? ""),
          });
          setSearchMessage(result.success ? null : result.message);
          if (result.success) setProducts(result.data);
        });
      }}>
        <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" name="productSearch" placeholder="SKU, модель или название" />
        <select className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm" name="categoryId"><option value="">Все категории</option>{products.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm" name="brandId"><option value="">Все бренды</option>{products.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button className="rounded-md border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-50" disabled={searchPending} type="submit">{searchPending ? "Поиск..." : "Найти"}</button>
      </form>
      {searchMessage && <p aria-live="polite" className="text-sm text-red-700">{searchMessage}</p>}
      {!products.products.length && !searchPending && <p className="text-sm text-zinc-500">Найдите товары по SKU, модели или названию.</p>}
      <form onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const selections = products.products.flatMap((product) => data.get(`selected-${product.id}`) ? [{ productId: product.id, quantity: Number(data.get(`quantity-${product.id}`)) }] : []);
        submit(() => addEstimateProductsAction(estimate.id, estimate.revision, selections));
      }}>
        <div className="divide-y divide-zinc-100">
          {products.products.map((product) => (
            <label className="grid cursor-pointer gap-3 py-3 sm:grid-cols-[auto_3rem_minmax(0,1fr)_7rem] sm:items-center" key={product.id}>
              <input className="size-4 accent-emerald-700" name={`selected-${product.id}`} type="checkbox" />
              {product.imageUrl ? <Image alt="" className="size-12 object-contain" height={48} src={product.imageUrl} unoptimized width={48} /> : <span className="flex size-12 items-center justify-center bg-zinc-100"><PackagePlus className="size-5 text-zinc-400" /></span>}
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{product.name}</span><span className="mt-1 block text-xs text-zinc-500">SKU {product.sku} · {product.partnerPrice ?? "Цена уточняется"} · {product.stock}</span>{product.expectedArrival && <span className="block text-xs text-zinc-500">Поступление: {product.expectedArrival}</span>}</span>
              <span className="text-xs font-medium text-zinc-500">Количество<input className="mt-1 h-9 w-full rounded-md border border-zinc-300 px-2 text-sm" defaultValue={1} min="0.001" name={`quantity-${product.id}`} step="0.001" type="number" /></span>
            </label>
          ))}
        </div>
        <button className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !products.products.length} type="submit">Добавить выбранные</button>
      </form>
    </div>
  );
}

function ServiceForm({ estimate, pending, services, submit }: { estimate: EstimateDetailDto; pending: boolean; services: EstimateServiceDto[]; submit: (operation: () => ReturnType<typeof addEstimateProductsAction>) => void }) {
  return <form className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_7rem_9rem_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); submit(() => addEstimateServiceAction(estimate.id, { expectedRevision: estimate.revision, serviceId: String(data.get("serviceId")), quantity: Number(data.get("quantity")), sellingUnitPrice: Number(data.get("sellingUnitPrice")) })); }}>
    <label className="text-xs font-medium text-zinc-600">Работа / услуга<select className={editorInputClass} name="serviceId" required>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.unitLabel}</option>)}</select></label>
    <label className="text-xs font-medium text-zinc-600">Количество<input className={editorInputClass} defaultValue={1} min="0.001" name="quantity" required step="0.001" type="number" /></label>
    <label className="text-xs font-medium text-zinc-600">Цена, {estimate.currencyCode}<input className={editorInputClass} min="0" name="sellingUnitPrice" required step="0.01" type="number" /></label>
    <button className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !services.length} type="submit">Добавить</button>
  </form>;
}

function CustomLineForm({ estimate, pending, submit }: { estimate: EstimateDetailDto; pending: boolean; submit: (operation: () => ReturnType<typeof addEstimateProductsAction>) => void }) {
  return <form className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_7rem_8rem_9rem_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); submit(() => addEstimateCustomLineAction(estimate.id, { expectedRevision: estimate.revision, description: String(data.get("description")), quantity: Number(data.get("quantity")), unit: String(data.get("unit")) as EstimateUnit, sellingUnitPrice: Number(data.get("sellingUnitPrice")) })); }}>
    <label className="text-xs font-medium text-zinc-600">Описание<input className={editorInputClass} maxLength={2000} name="description" required /></label>
    <label className="text-xs font-medium text-zinc-600">Количество<input className={editorInputClass} defaultValue={1} min="0.001" name="quantity" required step="0.001" type="number" /></label>
    <label className="text-xs font-medium text-zinc-600">Ед.<select className={editorInputClass} name="unit">{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
    <label className="text-xs font-medium text-zinc-600">Цена, {estimate.currencyCode}<input className={editorInputClass} min="0" name="sellingUnitPrice" required step="0.01" type="number" /></label>
    <button className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">Добавить</button>
  </form>;
}

function DisabledToolbarButton({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return <button className={toolbarSecondaryClass} disabled title="Доступно в следующих этапах" type="button"><Icon className="size-4" />{label}</button>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
