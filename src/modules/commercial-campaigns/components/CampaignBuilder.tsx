"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCampaignDraftAction } from "../actions/commercial-campaign.actions";
import type { CampaignBuilderOptions, CampaignDraftInput, CampaignType } from "../types";

const STEPS = ["Основное", "Товары", "Аудитория", "Проверка"] as const;

export function CampaignBuilder({ options }: { options: CampaignBuilderOptions }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [itemLimits, setItemLimits] = useState<Record<string, { minimum: number; maximum: number | null }>>({});
  const [companies, setCompanies] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<CampaignDraftInput["audienceMode"]>("explicit_company");
  const [values, setValues] = useState({ code: "", name: "", title: "", description: "", terms: "", type: "product_offer" as CampaignType, startsAt: "", endsAt: "", priority: 100, image: "" });
  const bind = (key: keyof typeof values) => ({ value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: key === "priority" ? Number(event.target.value) : event.target.value })) });
  const toggle = (id: string, values: string[], set: React.Dispatch<React.SetStateAction<string[]>>) => set(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  const toggleProduct = (id: string) => {
    toggle(id, products, setProducts);
    setItemLimits((current) => current[id] ? current : { ...current, [id]: { minimum: 1, maximum: null } });
  };
  const setLimit = (id: string, key: "minimum" | "maximum", value: number | null) => setItemLimits((current) => ({ ...current, [id]: { minimum: current[id]?.minimum ?? 1, maximum: current[id]?.maximum ?? null, [key]: value } }));
  const submit = () => startTransition(async () => {
    try {
      const input: CampaignDraftInput = { code: values.code.trim().toUpperCase(), name: values.name.trim(), partnerTitle: values.title.trim(), partnerDescription: values.description.trim(), campaignType: values.type, startsAt: new Date(values.startsAt).toISOString(), endsAt: new Date(values.endsAt).toISOString(), priority: values.priority, imageAssetPath: values.image.trim() || undefined, termsSummary: values.terms.trim(), audienceMode, companyIds: companies, items: products.map((productId, index) => ({ productId, sortOrder: index + 1, minimumQuantity: itemLimits[productId]?.minimum ?? 1, maximumQuantityPerCompany: itemLimits[productId]?.maximum ?? null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null })) };
      const result = await createCampaignDraftAction(input);
      setMessage(result.message);
      if (result.success) router.push(`/admin/commercial/campaigns/${result.data.id}`);
    } catch { setMessage("Проверьте даты и обязательные поля."); }
  });

  return <section className="rounded-md border border-zinc-200 bg-white p-5">
    <ol aria-label="Этапы кампании" className="grid gap-2 sm:grid-cols-4">{STEPS.map((label, index) => <li aria-current={step === index ? "step" : undefined} className={`border-b-2 pb-2 text-sm font-semibold ${step === index ? "border-emerald-600 text-emerald-800" : "border-zinc-200 text-zinc-500"}`} key={label}>{index + 1}. {label}</li>)}</ol>
    <div className="mt-6 min-h-80">
      {step === 0 ? <div className="grid gap-4 md:grid-cols-2"><Field label="Код"><input {...bind("code")} /></Field><Field label="Внутреннее название"><input {...bind("name")} /></Field><Field label="Заголовок для партнёра"><input {...bind("title")} /></Field><Field label="Тип"><select {...bind("type")}><option value="product_offer">Товарное предложение</option><option value="stock_clearance">Остатки</option><option value="arrival_promotion">Поступление</option><option value="reorder_campaign">Повторная закупка</option><option value="category_campaign">Категория</option><option value="partner_segment_offer">Сегмент партнёров</option></select></Field><Field label="Начало"><input {...bind("startsAt")} type="datetime-local" /></Field><Field label="Окончание"><input {...bind("endsAt")} type="datetime-local" /></Field><Field label="Приоритет"><input {...bind("priority")} min="0" max="1000" type="number" /></Field><Field label="Путь изображения"><input {...bind("image")} placeholder="/images/campaigns/..." /></Field><Field wide label="Описание для партнёра"><textarea {...bind("description")} rows={4} /></Field><Field wide label="Краткие условия"><textarea {...bind("terms")} rows={3} /></Field></div> : null}
      {step === 1 ? <fieldset><legend className="font-semibold">Товары из локального каталога</legend><p className="mt-1 text-sm text-zinc-600">Цены не сохраняются в кампании и разрешаются из актуальной коммерческой модели.</p><div className="mt-4 grid max-h-96 gap-2 overflow-y-auto">{options.products.map((product) => <div className="grid min-w-0 gap-3 rounded-md border border-zinc-200 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem] sm:items-end" key={product.id}><Check checked={products.includes(product.id)} label={<><b>{product.sku}</b> · {product.name}</>} onChange={() => toggleProduct(product.id)} />{products.includes(product.id) ? <><label className="grid gap-1 text-xs font-medium">Минимум<input className="h-11 rounded-md border border-zinc-300 px-3 text-base" min="1" onChange={(event) => setLimit(product.id, "minimum", Number(event.target.value))} type="number" value={itemLimits[product.id]?.minimum ?? 1} /></label><label className="grid gap-1 text-xs font-medium">Лимит компании<input className="h-11 rounded-md border border-zinc-300 px-3 text-base" min={itemLimits[product.id]?.minimum ?? 1} onChange={(event) => setLimit(product.id, "maximum", event.target.value ? Number(event.target.value) : null)} placeholder="Без лимита" type="number" value={itemLimits[product.id]?.maximum ?? ""} /></label></> : null}</div>)}</div></fieldset> : null}
      {step === 2 ? <div><fieldset><legend className="font-semibold">Управляемое правило аудитории</legend><div className="mt-3 grid gap-2">{([['explicit_company','Выбранные компании'],['all_active_partners','Все активные партнёры'],['commercial_mode_full','Полный коммерческий доступ'],['commercial_mode_retail_only','Только розничные цены'],['momentum_slowing','Снижение покупательской активности'],['momentum_attention','Требует внимания или высокий риск']] as const).map(([value,label]) => <label className="flex min-h-11 items-center gap-3" key={value}><input checked={audienceMode === value} name="audience" onChange={() => setAudienceMode(value)} type="radio" />{label}</label>)}</div></fieldset>{audienceMode === "explicit_company" ? <fieldset className="mt-4"><legend className="font-semibold">Компании</legend><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{options.companies.map((company) => <Check checked={companies.includes(company.id)} key={company.id} label={company.name} onChange={() => toggle(company.id, companies, setCompanies)} />)}</div></fieldset> : null}{audienceMode.startsWith("momentum_") ? <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Аудитория фиксируется при публикации. Начните с информационного предложения; финансовые условия требуют существующего согласованного профиля.</p> : null}</div> : null}
      {step === 3 ? <div className="space-y-4"><h2 className="text-xl font-semibold">Проверка перед созданием</h2><dl className="grid gap-3 text-sm sm:grid-cols-2"><Review label="Кампания" value={values.title || "Не заполнено"} /><Review label="Период" value={`${values.startsAt || "?"} — ${values.endsAt || "?"}`} /><Review label="Товаров" value={String(products.length)} /><Review label="Аудитория" value={audienceMode === "explicit_company" ? `${companies.length} компаний` : "Управляемое правило"} /><Review label="Ценообразование" value="Текущая разрешённая цена из read model 1С" /><Review label="Риск" value="Остаток не резервируется кампанией" /></dl><p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Количество ограничено текущим остатком. Кампания не создаёт независимую цену и не резервирует товар.</p></div> : null}
    </div>
    <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-4"><button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-40" disabled={step === 0 || pending} onClick={() => setStep((value) => value - 1)} type="button">Назад</button>{step < 3 ? <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" onClick={() => setStep((value) => value + 1)} type="button">Далее</button> : <button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || !products.length || (audienceMode === "explicit_company" && !companies.length)} onClick={submit} type="button">{pending ? "Создаём..." : "Создать черновик"}</button>}</div>
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}

function Field({ children, label, wide = false }: { children: React.ReactNode; label: string; wide?: boolean }) { return <label className={`grid gap-1 text-sm font-medium text-zinc-700 [&>input]:min-h-11 [&>input]:rounded-md [&>input]:border [&>input]:px-3 [&>select]:min-h-11 [&>select]:rounded-md [&>select]:border [&>select]:px-3 [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:p-3 ${wide ? "md:col-span-2" : ""}`}>{label}{children}</label>; }
function Check({ checked, label, onChange }: { checked: boolean; label: React.ReactNode; onChange: () => void }) { return <label className="flex min-h-11 items-center gap-3 rounded-md border border-zinc-200 p-3 text-sm"><input checked={checked} onChange={onChange} type="checkbox" /><span>{label}</span></label>; }
function Review({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-500">{label}</dt><dd className="font-medium text-zinc-950">{value}</dd></div>; }
