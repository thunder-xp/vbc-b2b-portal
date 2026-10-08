"use client";

import Image from "next/image";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";

import { ProductThumbnail } from "@/src/modules/catalog/components";
import { createCampaignDraftAction, searchCampaignCompaniesAction, searchCampaignProductsAction, updateCampaignDraftAction } from "../actions/commercial-campaign.actions";
import { fromCampaignDateTimeInput } from "../campaign-datetime";
import { CampaignBundlePreview } from "./CampaignBundlePreview";
import { configureCampaignItemMechanic, isCampaignRequiredQuantityValid } from "../campaign-draft-mechanics";
import { isSpendConfigValid } from "../spend-config";
import { missingPromoPriceMessage, SPECIAL_OFFERS_PROMO_PROFILE } from "../promo-profile";
import type { CampaignBuilderOptions, CampaignDraftInput, CampaignDraftSeed, CampaignMechanicType, CampaignProductOption, CampaignType } from "../types";

const STEPS = ["Основное", "Товары", "Аудитория", "Проверка"] as const;
const AUDIENCES: ReadonlyArray<[CampaignDraftInput["audienceMode"], string]> = [
  ["explicit_company", "Выбранные компании"], ["all_active_partners", "Все активные партнёры"],
  ["commercial_mode_full", "Полный коммерческий доступ"], ["commercial_mode_retail_only", "Только розничные цены"],
  ["momentum_slowing", "Динамика: замедление"], ["momentum_attention", "Динамика: внимание / высокий риск"],
];
type SelectedItem = CampaignDraftInput["items"][number] & { product: CampaignProductOption };

export function CampaignBuilder({ options, initial, preview = false }: { options: CampaignBuilderOptions; initial?: CampaignDraftSeed; preview?: boolean }) {
  const router = useRouter();
  const requestId = useRef(crypto.randomUUID());
  const [step, setStep] = useState(preview ? 3 : 0);
  const [pending, startTransition] = useTransition();
  const [searchPending, startSearch] = useTransition();
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [productSearch, setProductSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productResult, setProductResult] = useState({ items: options.products, totalCount: options.productTotalCount, totalPages: Math.max(1, Math.ceil(options.productTotalCount / 25)) });
  const [companySearch, setCompanySearch] = useState("");
  const [companyResult, setCompanyResult] = useState(options.companies);
  const [companies, setCompanies] = useState<string[]>(initial?.companyIds ?? []);
  const [audienceMode, setAudienceMode] = useState<CampaignDraftInput["audienceMode"]>(initial?.audienceMode ?? "explicit_company");
  const [items, setItems] = useState<SelectedItem[]>(initial?.items ?? []);
  const [spendThreshold, setSpendThreshold] = useState(initial?.spendConfig?.thresholdAmountUsd ?? "");
  const [spendReward, setSpendReward] = useState(initial?.spendConfig?.rewardProductId ?? "");
  const [values, setValues] = useState(initial?.values ?? { code: "", name: "", title: "", description: "", internalNote: "", terms: "", type: "product_offer" as CampaignType, startsAt: "", endsAt: "", priority: 100, image: "", mechanicType: "legacy_promo" as CampaignMechanicType });

  useEffect(() => {
    if (step !== 1) return;
    const timer = window.setTimeout(() => startSearch(async () => {
      const result = await searchCampaignProductsAction({ search: productSearch, categoryId: categoryId || undefined, brandId: brandId || undefined, inStockOnly, page: productPage });
      if (result.success) setProductResult(result.data); else setMessage(result.message);
    }), 180);
    return () => window.clearTimeout(timer);
  }, [brandId, categoryId, inStockOnly, productPage, productSearch, step]);

  useEffect(() => {
    if (step !== 2 || audienceMode !== "explicit_company") return;
    const timer = window.setTimeout(() => startSearch(async () => {
      const result = await searchCampaignCompaniesAction(companySearch);
      if (result.success) setCompanyResult(result.data.items); else setMessage(result.message);
    }), 250);
    return () => window.clearTimeout(timer);
  }, [audienceMode, companySearch, step]);

  const mark = () => setDirty(true);
  const bind = (key: keyof typeof values) => ({ value: values[key], onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setValues((current) => ({ ...current, [key]: key === "priority" ? Number(event.target.value) : event.target.value })); mark(); } });
  const bindDate = (key: "startsAt" | "endsAt") => ({ value: values[key], onInput: (event: FormEvent<HTMLInputElement>) => { const value = event.currentTarget.value; setValues((current) => ({ ...current, [key]: value })); mark(); } });
  const selectedIds = useMemo(() => new Set(items.map((item) => item.productId)), [items]);
  const selectedCompanies = useMemo(() => new Map([...options.companies, ...companyResult].filter((company) => companies.includes(company.id)).map((company) => [company.id, company])), [companies, companyResult, options.companies]);

  const toggleProduct = (product: CampaignProductOption) => {
    if (selectedIds.has(product.id) && spendReward === product.id) setSpendReward("");
    setItems((current) => current.some((item) => item.productId === product.id)
      ? current.filter((item) => item.productId !== product.id)
      : current.length >= 50 ? current : [...current, configureCampaignItemMechanic<SelectedItem>({
        productId: product.id, sortOrder: current.length + 1, minimumQuantity: 1,
        maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null,
        partnerMessage: null, promoThresholdQuantity: null, requiredBundleQuantity: null,
        attachRole: null, requiredTriggerQuantity: null, product,
      }, values.mechanicType)]);
    mark();
  };
  const patchItem = (productId: string, patch: Partial<SelectedItem>) => { setItems((current) => current.map((item) => item.productId === productId ? { ...item, ...patch } : item)); mark(); };
  const moveItem = (index: number, delta: number) => { setItems((current) => { const target = index + delta; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((item, sortOrder) => ({ ...item, sortOrder: sortOrder + 1 })); }); mark(); };
  const toggleCompany = (id: string) => { setCompanies((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); mark(); };
  const changeMechanic = (mechanicType: CampaignMechanicType) => {
    setValues((current) => ({ ...current, mechanicType }));
    setSpendThreshold(""); setSpendReward("");
    setItems((current) => current.map((item) => configureCampaignItemMechanic(item, mechanicType)));
    mark();
  };

  const spendConfig = () => values.mechanicType === "spend_threshold_promo" ? {
    thresholdAmountUsd: spendThreshold, currency: "USD" as const,
    qualifyingProductIds: items.filter((item) => item.productId !== spendReward).map((item) => item.productId), rewardProductId: spendReward,
  } : null;
  const changeSpendRole = (productId: string, reward: boolean) => {
    const rewardId = reward ? productId : spendReward === productId ? "" : spendReward;
    setSpendReward(rewardId);
    setItems((current) => current.map((item) => ({ ...item,
      benefitType: item.productId === rewardId ? "existing_price_profile" : "informational_only",
      governedBenefitReference: item.productId === rewardId ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null })));
    mark();
  };
  const validate = (targetStep: number) => {
    const next: Record<string, string> = {};
    if (targetStep === 0) {
      if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(values.code.trim().toUpperCase())) next.code = "Код: 3–40 символов, латиница, цифры, _ или -.";
      if (values.name.trim().length < 3) next.name = "Укажите внутреннее название.";
      if (values.title.trim().length < 3) next.title = "Укажите заголовок для партнёра.";
      if (values.description.trim().length < 10) next.description = "Описание должно содержать не менее 10 символов.";
      if (values.terms.trim().length < 3) next.terms = "Укажите краткие условия.";
      if (!values.startsAt || !values.endsAt || Date.parse(values.endsAt) <= Date.parse(values.startsAt)) next.period = "Дата окончания должна быть позже даты начала.";
    }
    if (targetStep === 1) {
      if (!items.length) next.items = "Добавьте хотя бы один товар.";
      if (items.some((item) => item.minimumQuantity < 1 || item.maximumQuantityPerCompany !== null && item.maximumQuantityPerCompany < item.minimumQuantity)) next.items = "Проверьте минимальное количество и лимит компании.";
      const invalidPromo = items.find((item) => item.benefitType === "existing_price_profile" && (item.governedBenefitReference !== SPECIAL_OFFERS_PROMO_PROFILE.externalRef || item.product.promoPrice?.currency !== SPECIAL_OFFERS_PROMO_PROFILE.currency));
      if (invalidPromo) next.items = missingPromoPriceMessage(invalidPromo.product.sku);
      if (values.mechanicType === "spend_threshold_promo" && !isSpendConfigValid(spendConfig(), items))
        next.items = "Укажите положительный USD-порог (до 2 знаков), товары закупки и один отдельный товар с PROMO.";
      if (values.mechanicType === "conditional_attach_promo") {
        if (!items.some((item) => item.attachRole === "TRIGGER")) next.items = "Добавьте хотя бы один товар-условие.";
        if (items.filter((item) => item.attachRole === "REWARD").length !== 1) next.items = "Выберите ровно один товар с PROMO.";
        const invalid = items.find((item) => item.attachRole === "TRIGGER"
          && !isCampaignRequiredQuantityValid(item.requiredTriggerQuantity, item.minimumQuantity, item.maximumQuantityPerCompany));
        if (invalid) next.items = `Укажите целое количество условия от 1 до 9999 для SKU ${invalid.product.sku}.`;
      }
      if (values.mechanicType === "bundle_special_price") {
        if (items.some(i => !/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(i.bundleSpecialUnitPrice ?? "") || Number(i.bundleSpecialUnitPrice) <= 0 || !["USD", "MDL"].includes(i.bundleSpecialCurrency ?? "") || !isCampaignRequiredQuantityValid(i.requiredBundleQuantity))) next.items = "Проверьте количество, спеццену и валюту каждой строки набора.";
        if (new Set(items.map(i => i.bundleSpecialCurrency)).size !== 1) next.items = "Валюта строк набора должна совпадать.";
      }
      if (values.mechanicType === "fixed_bundle_promo") {
        if (items.length < 2) next.items = "В комплекте должно быть не менее двух разных товаров.";
        const invalid = items.find((item) => !isCampaignRequiredQuantityValid(item.requiredBundleQuantity, item.minimumQuantity, item.maximumQuantityPerCompany));
        if (invalid) next.items = `Укажите количество в комплекте от 1 до 9999 для SKU ${invalid.product.sku}.`;
      }
      if (values.mechanicType === "quantity_threshold_promo") {
        const invalidThreshold = items.find((item) => item.benefitType !== "existing_price_profile"
          || !isCampaignRequiredQuantityValid(item.promoThresholdQuantity, 1, item.maximumQuantityPerCompany));
        if (invalidThreshold) next.items = `Укажите целое количество PROMO от 1 до 9999 для SKU ${invalidThreshold.product.sku}.`;
      }
    }
    if (targetStep === 2 && audienceMode === "explicit_company" && !companies.length) next.audience = "Выберите хотя бы одну активную компанию.";
    setErrors(next); return Object.keys(next).length === 0;
  };
  const nextStep = () => { if (validate(step)) setStep((value) => Math.min(3, value + 1)); };

  const payload = (identity: string): CampaignDraftInput => ({
    spendConfig: spendConfig(), contractVersion: "3", requestId: identity, code: values.code.trim().toUpperCase(), name: values.name.trim(), partnerTitle: values.title.trim(), partnerDescription: values.description.trim(), internalNote: values.internalNote.trim() || undefined,
    campaignType: values.type, startsAt: fromCampaignDateTimeInput(values.startsAt), endsAt: fromCampaignDateTimeInput(values.endsAt), priority: values.priority, imageAssetPath: values.image || undefined, termsSummary: values.terms.trim(), mechanicType: values.mechanicType, audienceMode, companyIds: companies,
    items: items.map((item, index) => ({ productId: item.productId, sortOrder: index + 1, minimumQuantity: item.minimumQuantity, maximumQuantityPerCompany: item.maximumQuantityPerCompany, benefitType: item.benefitType, governedBenefitReference: item.governedBenefitReference, partnerMessage: item.partnerMessage, promoThresholdQuantity: item.promoThresholdQuantity, requiredBundleQuantity: item.requiredBundleQuantity ?? null, bundleSpecialUnitPrice: item.bundleSpecialUnitPrice ?? null, bundleSpecialCurrency: item.bundleSpecialCurrency ?? null, attachRole: item.attachRole ?? null, requiredTriggerQuantity: item.requiredTriggerQuantity ?? null })),
  });
  const save = () => {
    if (![0, 1, 2].every(validate)) { setMessage("Исправьте ошибки перед сохранением."); return; }
    startTransition(async () => {
      try {
        const input = payload(requestId.current);
        const result = initial ? await updateCampaignDraftAction({ ...input, campaignId: initial.campaignId, expectedRevision: revision }) : await createCampaignDraftAction(input);
        setMessage(result.message);
        if (result.success) {
          setDirty(false); requestId.current = crypto.randomUUID();
          if ("revision" in result.data) setRevision(result.data.revision);
          else router.push(`/admin/commercial/campaigns/${result.data.id}`);
        }
      } catch { setMessage("Проверьте даты и обязательные поля."); }
    });
  };

  const audienceLabel = audienceMode === "explicit_company" ? `${companies.length} компаний` : AUDIENCES.find(([value]) => value === audienceMode)?.[1] ?? "";
  const previewInput = (): CampaignDraftInput | null => {
    if (values.mechanicType !== "bundle_special_price" || !values.startsAt || !values.endsAt || Date.parse(values.endsAt) <= Date.parse(values.startsAt)) return null;
    try { return payload("00000000-0000-4000-8000-000000000000"); } catch { return null; }
  };
  const bundleInput = previewInput();
  const bundlePreview = bundleInput ? <CampaignBundlePreview input={bundleInput} companies={options.companies} /> : null;
  if (preview) return <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"><CampaignPreview values={values} items={items} spendThreshold={spendThreshold} audienceLabel={audienceLabel} errors={errors} />{bundlePreview}</section>;

  return <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className={`text-sm font-medium ${dirty ? "text-amber-700" : "text-emerald-700"}`}>{dirty ? "Есть несохранённые изменения" : initial ? `Сохранено · ревизия ${revision}` : "Новый черновик"}</p>{initial ? <button className="min-h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || !dirty} onClick={save} type="button">{pending ? "Сохраняем…" : "Сохранить изменения"}</button> : null}</div>
    <ol aria-label="Этапы предложения" className="grid gap-2 sm:grid-cols-4">{STEPS.map((label, index) => <li key={label}><button aria-current={step === index ? "step" : undefined} className={`w-full border-b-2 pb-2 text-left text-sm font-semibold ${step === index ? "border-emerald-600 text-emerald-800" : "border-zinc-200 text-zinc-500"}`} onClick={() => setStep(index)} type="button">{index + 1}. {label}</button></li>)}</ol>
    <div className="mt-6 min-h-80">
      {step === 0 ? <div className="grid gap-4 md:grid-cols-2"><Field error={errors.code} label="Код"><input {...bind("code")} /></Field><Field error={errors.name} label="Внутреннее название"><input {...bind("name")} /></Field><Field error={errors.title} label="Заголовок для партнёра"><input {...bind("title")} /></Field><Field label="Тип"><select {...bind("type")}><option value="product_offer">Товарное предложение</option><option value="stock_clearance">Остатки</option><option value="arrival_promotion">Поступление</option><option value="reorder_campaign">Повторная закупка</option><option value="category_campaign">Категория</option><option value="partner_segment_offer">Сегмент партнёров</option></select></Field><Field wide label="Коммерческая механика"><select onChange={(event) => changeMechanic(event.target.value as CampaignMechanicType)} value={values.mechanicType}><option value="legacy_promo">Обычная PROMO акция</option><option value="quantity_threshold_promo">Количество → PROMO</option><option value="bundle_special_price">Набор по спеццене</option><option value="fixed_bundle_promo">Комплект → PROMO</option><option value="conditional_attach_promo">Купи X → PROMO на Y</option><option value="spend_threshold_promo">Сумма закупки → PROMO</option></select><span className="text-xs font-normal text-zinc-500">PROMO всегда берётся из синхронизированного профиля 1С.</span></Field><Field error={errors.period} label="Начало"><input {...bindDate("startsAt")} type="datetime-local" /></Field><Field error={errors.period} label="Окончание"><input {...bindDate("endsAt")} type="datetime-local" /></Field><Field label="Приоритет"><input {...bind("priority")} min="0" max="1000" type="number" /></Field><Field label="Оформление"><select {...bind("image")}><option value="">Без изображения</option>{options.assets.map((asset) => <option key={asset.path} value={asset.path}>{asset.label}</option>)}</select></Field>{values.image ? <div className="relative aspect-[16/5] overflow-hidden rounded-md border md:col-span-2"><Image alt="Предпросмотр изображения предложения" className="object-cover" fill sizes="800px" src={values.image} /></div> : null}<Field wide error={errors.description} label="Описание для партнёра"><textarea {...bind("description")} rows={4} /></Field><Field wide error={errors.terms} label="Краткие условия"><textarea {...bind("terms")} rows={3} /></Field><Field wide label="Внутренняя заметка"><textarea {...bind("internalNote")} rows={2} /></Field></div> : null}
      {step === 1 && values.mechanicType === "spend_threshold_promo" ? <Field label="Порог закупки, USD"><input aria-label="Порог закупки, USD" inputMode="decimal" value={spendThreshold} onChange={(event) => { setSpendThreshold(event.target.value); mark(); }} placeholder="1500.00" /><span className="text-xs font-normal text-zinc-500">Базовые цены партнёра в USD · reward не входит в сумму.</span></Field> : null}
      {step === 1 ? <ProductPicker {...{ options, productSearch, setProductSearch, categoryId, setCategoryId, brandId, setBrandId, inStockOnly, setInStockOnly, productPage, setProductPage, productResult, searchPending, items, selectedIds, toggleProduct, patchItem, moveItem, mechanicType: values.mechanicType, spendReward, changeSpendRole, error: errors.items }} /> : null}
      {step === 2 ? <div><fieldset><legend className="font-semibold">Аудитория предложения</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{AUDIENCES.map(([value, label]) => <label className="flex min-h-11 items-center gap-3 rounded-md border border-zinc-200 px-3" key={value}><input checked={audienceMode === value} name="audience" onChange={() => { setAudienceMode(value); mark(); }} type="radio" />{label}</label>)}</div></fieldset>{audienceMode === "explicit_company" ? <div className="mt-5"><label className="grid gap-1 text-sm font-medium">Поиск компании<input className="min-h-11 rounded-md border border-zinc-300 px-3" onChange={(event) => setCompanySearch(event.target.value)} placeholder="Название компании" value={companySearch} /></label><p className="mt-2 text-sm text-zinc-600">Выбрано: {companies.length}</p><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{[...selectedCompanies.values(), ...companyResult.filter((company) => !selectedCompanies.has(company.id))].map((company) => <Check checked={companies.includes(company.id)} key={company.id} label={company.name} onChange={() => toggleCompany(company.id)} />)}</div>{errors.audience ? <ErrorText>{errors.audience}</ErrorText> : null}</div> : null}<p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Аудитория фиксируется в неизменяемом снимке при публикации.</p></div> : null}
      {step === 3 ? <><CampaignPreview values={values} items={items} spendThreshold={spendThreshold} audienceLabel={audienceLabel} errors={errors} />{bundlePreview}</> : null}
    </div>
    <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-4"><button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-40" disabled={step === 0 || pending} onClick={() => setStep((value) => value - 1)} type="button">Назад</button>{step < 3 ? <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white" onClick={nextStep} type="button">Далее</button> : <button className="min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending} onClick={save} type="button">{pending ? "Сохраняем…" : initial ? "Сохранить изменения" : "Создать черновик"}</button>}</div>
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}

type ProductPickerProps = {
  options: CampaignBuilderOptions; productSearch: string; setProductSearch: Dispatch<SetStateAction<string>>; categoryId: string; setCategoryId: Dispatch<SetStateAction<string>>; brandId: string; setBrandId: Dispatch<SetStateAction<string>>; inStockOnly: boolean; setInStockOnly: Dispatch<SetStateAction<boolean>>; productPage: number; setProductPage: Dispatch<SetStateAction<number>>; productResult: { items: CampaignProductOption[]; totalCount: number; totalPages: number }; searchPending: boolean; items: SelectedItem[]; selectedIds: Set<string>; toggleProduct: (product: CampaignProductOption) => void; patchItem: (id: string, patch: Partial<SelectedItem>) => void; moveItem: (index: number, delta: number) => void; mechanicType: CampaignMechanicType; spendReward: string; changeSpendRole: (id: string, reward: boolean) => void; error?: string;
};
function ProductPicker(props: ProductPickerProps) {
  const { options, productResult, items } = props;
  return <div>
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <label className="grid gap-1 text-sm font-medium" htmlFor="campaign-product-search">Быстрый поиск товара</label>
      <div className="relative mt-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
        <input autoComplete="off" className="min-h-11 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3" id="campaign-product-search" onChange={(event) => { props.setProductSearch(event.target.value); props.setProductPage(1); }} placeholder="SKU, модель или название" type="search" value={props.productSearch} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
        <label className="grid gap-1 text-sm font-medium">Категория<select className="min-h-11 rounded-md border border-zinc-300 bg-white px-3" onChange={(event) => { props.setCategoryId(event.target.value); props.setProductPage(1); }} value={props.categoryId}><option value="">Все</option>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Бренд<select className="min-h-11 rounded-md border border-zinc-300 bg-white px-3" onChange={(event) => { props.setBrandId(event.target.value); props.setProductPage(1); }} value={props.brandId}><option value="">Все</option>{options.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="flex min-h-11 items-end gap-2 pb-2 text-sm font-medium"><input checked={props.inStockOnly} onChange={(event) => { props.setInStockOnly(event.target.checked); props.setProductPage(1); }} type="checkbox" /> Только в наличии</label>
      </div>
    </div>
    <p aria-live="polite" className="mt-3 text-sm text-zinc-600">{props.searchPending ? "Ищем…" : `Найдено: ${productResult.totalCount}.`} Показано не более 25 товаров. Выбрано: {items.length}/50.</p>
    <div className="mt-3 grid gap-2">{productResult.items.map((product) => <button aria-pressed={props.selectedIds.has(product.id)} className={`grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 text-left ${props.selectedIds.has(product.id) ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"}`} key={product.id} onClick={() => props.toggleProduct(product)} type="button"><span className="relative block size-14 overflow-hidden rounded bg-white"><ProductThumbnail alt="" sizes="56px" src={product.imageUrl} variant="xs" /></span><span className="min-w-0"><b className="block truncate">{product.sku} · {product.model || product.name}</b><span className="block truncate text-xs text-zinc-500">{product.brandName || "Без бренда"} · {product.categoryName || "Без категории"}</span><span className="text-xs text-zinc-600">Остаток: {product.availableQuantity ?? "—"}{product.currentPrice ? ` · ${product.currentPrice.amount} ${product.currentPrice.currency}` : ""}</span></span><span className="text-sm font-semibold text-emerald-700">{props.selectedIds.has(product.id) ? "Выбран" : "Добавить"}</span></button>)}</div>
    <div className="mt-3 flex items-center justify-between"><button className="min-h-10 rounded-md border px-3 text-sm disabled:opacity-40" disabled={props.productPage <= 1 || props.searchPending} onClick={() => props.setProductPage((value) => value - 1)} type="button">Назад</button><span className="text-sm">{props.productPage} / {productResult.totalPages}</span><button className="min-h-10 rounded-md border px-3 text-sm disabled:opacity-40" disabled={props.productPage >= productResult.totalPages || props.searchPending} onClick={() => props.setProductPage((value) => value + 1)} type="button">Далее</button></div>
    {items.length ? <section className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-3"><h3 className="font-semibold">Выбранные товары</h3><div className="mt-2 grid gap-2">{items.map((item, index) => <SelectedProduct key={item.productId} item={item} index={index} count={items.length} mechanicType={props.mechanicType} spendReward={props.spendReward} onSpendRole={props.changeSpendRole} onMove={props.moveItem} onPatch={props.patchItem} onRemove={() => props.toggleProduct(item.product)} />)}</div></section> : null}
    {props.error ? <ErrorText>{props.error}</ErrorText> : null}
  </div>;
}

function SelectedProduct({ item, index, count, mechanicType, spendReward, onSpendRole, onMove, onPatch, onRemove }: { item: SelectedItem; index: number; count: number; mechanicType: CampaignMechanicType; spendReward: string; onSpendRole: (id: string, reward: boolean) => void; onMove: (index: number, delta: number) => void; onPatch: (id: string, patch: Partial<SelectedItem>) => void; onRemove: () => void }) {
  const id = item.productId;
  const promoMissing = item.benefitType === "existing_price_profile" && item.product.promoPrice?.currency !== SPECIAL_OFFERS_PROMO_PROFILE.currency;
  return <div className="min-w-0 rounded-md border border-zinc-200 bg-white p-3" data-testid="selected-campaign-product"><div className="flex min-w-0 items-center gap-3"><div className="relative size-16 shrink-0 overflow-hidden rounded border border-zinc-100 bg-zinc-50"><ProductThumbnail alt={item.product.name} className="object-contain p-1.5" sizes="64px" src={item.product.imageUrl} variant="sm" /></div><div className="min-w-0 flex-1"><b className="block truncate text-sm">{item.product.sku} · {item.product.model || item.product.name}</b><p className="truncate text-xs text-zinc-500">{item.product.name}</p><div className="mt-2 flex gap-1"><button aria-label="Переместить выше" className="min-h-8 rounded border px-2" disabled={index === 0} onClick={() => onMove(index, -1)} type="button">↑</button><button aria-label="Переместить ниже" className="min-h-8 rounded border px-2" disabled={index === count - 1} onClick={() => onMove(index, 1)} type="button">↓</button></div></div></div><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:items-end">{mechanicType === "spend_threshold_promo" ? <SmallField label="Роль"><select aria-label={`Роль ${item.product.sku}`} value={item.productId === spendReward ? "REWARD" : "QUALIFYING_SPEND"} onChange={(event) => onSpendRole(id,event.target.value === "REWARD")}><option value="QUALIFYING_SPEND">Товар закупки · USD</option><option value="REWARD">Товар с PROMO</option></select></SmallField> : mechanicType === "conditional_attach_promo" ? <><SmallField label="Роль"><select aria-label={`Роль ${item.product.sku}`} value={item.attachRole ?? "TRIGGER"} onChange={(event) => { const role = event.target.value as "TRIGGER" | "REWARD"; onPatch(id, { attachRole: role, requiredTriggerQuantity: null, benefitType: role === "REWARD" ? "existing_price_profile" : "informational_only", governedBenefitReference: role === "REWARD" ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null }); }}><option value="TRIGGER">Товар-условие</option><option value="REWARD">Товар с PROMO</option></select></SmallField>{item.attachRole === "TRIGGER" ? <SmallField label="Количество условия"><input aria-label={`Количество условия ${item.product.sku}`} min="1" max="9999" type="number" placeholder="Укажите" value={item.requiredTriggerQuantity ?? ""} onChange={(event) => onPatch(id, { requiredTriggerQuantity: event.target.value ? Number(event.target.value) : null })} /></SmallField> : <SmallField label="Минимум"><input min="1" type="number" value={item.minimumQuantity} onChange={(event) => onPatch(id, { minimumQuantity: Number(event.target.value) })} /></SmallField>}</> : ["fixed_bundle_promo", "bundle_special_price"].includes(mechanicType) ? <SmallField label="Количество в комплекте"><input aria-label={`Количество в комплекте ${item.product.sku}`} min="1" max="9999" onChange={(event) => onPatch(id, { requiredBundleQuantity: event.target.value ? Number(event.target.value) : null })} placeholder="Укажите" type="number" value={item.requiredBundleQuantity ?? ""} /></SmallField> : mechanicType === "quantity_threshold_promo" ? <SmallField label="PROMO от, шт."><input aria-label={`PROMO от, шт. ${item.product.sku}`} min="1" max="9999" onChange={(event) => onPatch(id, { promoThresholdQuantity: event.target.value ? Number(event.target.value) : null })} placeholder="Укажите" type="number" value={item.promoThresholdQuantity ?? ""} /></SmallField> : <SmallField label="Минимум"><input min="1" onChange={(event) => onPatch(id, { minimumQuantity: Number(event.target.value) })} type="number" value={item.minimumQuantity} /></SmallField>}{mechanicType === "bundle_special_price" ? <><SmallField label="Спеццена за единицу"><input aria-label={`Спеццена ${item.product.sku}`} inputMode="decimal" value={item.bundleSpecialUnitPrice ?? ""} onChange={e => onPatch(id, { bundleSpecialUnitPrice: e.target.value || null })} /></SmallField><SmallField label="Валюта"><select aria-label={`Валюта ${item.product.sku}`} value={item.bundleSpecialCurrency ?? "USD"} onChange={e => onPatch(id, { bundleSpecialCurrency: e.target.value as "USD" | "MDL" })}><option value="USD">USD</option><option value="MDL">MDL</option></select></SmallField></> : null}<SmallField label="Лимит"><input min={mechanicType === "quantity_threshold_promo" ? item.promoThresholdQuantity ?? 1 : item.minimumQuantity} onChange={(event) => onPatch(id, { maximumQuantityPerCompany: event.target.value ? Number(event.target.value) : null })} placeholder="Нет" type="number" value={item.maximumQuantityPerCompany ?? ""} /></SmallField>{mechanicType !== "legacy_promo" ? <SmallField label="Коммерческое условие"><output className="flex min-h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2">{mechanicType === "spend_threshold_promo" ? item.benefitType === "existing_price_profile" ? "Выгода → PROMO" : "Закупка · цена партнёра" : mechanicType === "conditional_attach_promo" ? item.attachRole === "TRIGGER" ? "Условие · цена партнёра" : "Выгода → PROMO" : mechanicType === "bundle_special_price" ? "Набор · спеццена кампании" : mechanicType === "fixed_bundle_promo" ? "Комплект → PROMO" : "Количество → PROMO"}</output></SmallField> : <SmallField label="Коммерческое условие"><select onChange={(event) => { const benefitType = event.target.value as SelectedItem["benefitType"]; onPatch(id, { benefitType, governedBenefitReference: benefitType === "existing_price_profile" ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null }); }} value={item.benefitType}><option value="informational_only">Текущая цена партнёра</option><option value="existing_price_profile">Спеццена PROMO</option></select></SmallField>}{item.benefitType === "existing_price_profile" ? <SmallField label="Профиль цены"><output className="flex min-h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2">PROMO · USD</output></SmallField> : <SmallField label="Сообщение партнёру"><input maxLength={500} onChange={(event) => onPatch(id, { partnerMessage: event.target.value || null })} value={item.partnerMessage ?? ""} /></SmallField>}<button className="min-h-10 rounded-md border border-rose-300 px-3 text-sm text-rose-700 sm:col-span-2 xl:col-span-1" onClick={onRemove} type="button">Удалить</button></div>{mechanicType === "quantity_threshold_promo" && item.promoThresholdQuantity ? <p className="mt-2 text-sm font-semibold text-emerald-800">От {item.promoThresholdQuantity} шт. → PROMO</p> : null}{promoMissing ? <ErrorText>{missingPromoPriceMessage(item.product.sku)}</ErrorText> : null}</div>;
}

function CampaignPreview({ values, items, spendThreshold, audienceLabel, errors }: { values: { title: string; description: string; terms: string; startsAt: string; endsAt: string; image: string; mechanicType: CampaignMechanicType }; items: SelectedItem[]; spendThreshold: string; audienceLabel: string; errors: Record<string, string> }) {
  const commercialReady = items.every((item) => {
    if (values.mechanicType === "bundle_special_price") return Number(item.bundleSpecialUnitPrice) > 0 && ["USD", "MDL"].includes(item.bundleSpecialCurrency ?? "") && isCampaignRequiredQuantityValid(item.requiredBundleQuantity);
    if (values.mechanicType === "spend_threshold_promo") return item.benefitType === "informational_only" || item.product.promoPrice?.currency === "USD";
    if (values.mechanicType === "legacy_promo") return item.benefitType === "informational_only" || item.governedBenefitReference === SPECIAL_OFFERS_PROMO_PROFILE.externalRef && item.product.promoPrice?.currency === SPECIAL_OFFERS_PROMO_PROFILE.currency;
    if (values.mechanicType === "conditional_attach_promo") return item.attachRole === "TRIGGER"
      ? isCampaignRequiredQuantityValid(item.requiredTriggerQuantity, item.minimumQuantity, item.maximumQuantityPerCompany)
      : item.attachRole === "REWARD" && item.benefitType === "existing_price_profile" && item.governedBenefitReference === SPECIAL_OFFERS_PROMO_PROFILE.externalRef && item.product.promoPrice?.currency === "USD";
    if (values.mechanicType === "fixed_bundle_promo") return item.benefitType === "existing_price_profile"
      && item.governedBenefitReference === SPECIAL_OFFERS_PROMO_PROFILE.externalRef && item.product.promoPrice?.currency === "USD"
      && isCampaignRequiredQuantityValid(item.requiredBundleQuantity, item.minimumQuantity, item.maximumQuantityPerCompany);
    return item.benefitType === "existing_price_profile"
      && item.governedBenefitReference === SPECIAL_OFFERS_PROMO_PROFILE.externalRef
      && item.product.promoPrice?.currency === SPECIAL_OFFERS_PROMO_PROFILE.currency
      && isCampaignRequiredQuantityValid(item.promoThresholdQuantity, 1, item.maximumQuantityPerCompany);
  });
  const spendReady = values.mechanicType !== "spend_threshold_promo" || isSpendConfigValid({ thresholdAmountUsd: spendThreshold, currency: "USD",
    qualifyingProductIds: items.filter((item) => item.benefitType === "informational_only").map((item) => item.productId),
    rewardProductId: items.find((item) => item.benefitType === "existing_price_profile")?.productId ?? "" }, items);
  const checks = [{ label: "Основные данные", ok: values.title.trim().length >= 3 && values.description.trim().length >= 10 }, { label: "Период", ok: Boolean(values.startsAt && values.endsAt && Date.parse(values.endsAt) > Date.parse(values.startsAt)) }, { label: "Товары", ok: values.mechanicType === "conditional_attach_promo" ? items.some((item) => item.attachRole === "TRIGGER") && items.filter((item) => item.attachRole === "REWARD").length === 1 : values.mechanicType === "fixed_bundle_promo" ? items.length >= 2 : items.length > 0 }, { label: "Коммерческие условия", ok: commercialReady && spendReady }, { label: "Аудитория", ok: Boolean(audienceLabel) }, { label: "Оформление", ok: values.terms.trim().length >= 3 }];
  return <div className="space-y-5"><section className="overflow-hidden rounded-md border border-zinc-200"><div className="relative min-h-40 bg-zinc-100">{values.image ? <Image alt="" className="object-cover" fill sizes="900px" src={values.image} /> : null}</div><div className="p-5"><p className="text-xs font-semibold uppercase text-emerald-700">Специальное предложение</p><h2 className="mt-1 text-2xl font-semibold">{values.title || "Заголовок предложения"}</h2><p className="mt-2 text-sm text-zinc-600">{values.description || "Описание предложения"}</p><p className="mt-3 text-sm">{values.startsAt || "?"} — {values.endsAt || "?"}</p>{values.mechanicType === "spend_threshold_promo" ? <p className="mt-3 text-sm font-semibold">Порог закупки: {spendThreshold || "?"} USD · базовая цена партнёра · reward исключён</p> : null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => <div className="rounded border p-3" key={item.productId}><b>{item.product.sku} · {item.product.model || item.product.name}</b><p className="text-sm text-zinc-600">{item.product.currentPrice ? `${item.product.currentPrice.amount} ${item.product.currentPrice.currency}` : "Текущая цена не опубликована"} · остаток {item.product.availableQuantity ?? "—"}</p>{values.mechanicType === "bundle_special_price" ? <p className="text-sm font-semibold text-emerald-800">Спеццена: {item.bundleSpecialUnitPrice ?? "?"} {item.bundleSpecialCurrency ?? "?"}</p> : null}{item.benefitType === "existing_price_profile" ? <p className={item.product.promoPrice ? "text-sm font-semibold text-emerald-800" : "text-sm text-rose-700"}>{item.product.promoPrice ? `Спеццена PROMO: ${item.product.promoPrice.amount} ${item.product.promoPrice.currency}` : missingPromoPriceMessage(item.product.sku)}</p> : null}<p className="text-xs">{values.mechanicType === "spend_threshold_promo" ? item.benefitType === "existing_price_profile" ? "Товар с PROMO" : "Товар закупки · базовая цена партнёра в USD" : values.mechanicType === "conditional_attach_promo" ? item.attachRole === "TRIGGER" ? `Товар-условие: ${item.requiredTriggerQuantity ?? "?"} шт. · цена партнёра` : "Товар с PROMO" : ["fixed_bundle_promo", "bundle_special_price"].includes(values.mechanicType) ? `Количество в комплекте: ${item.requiredBundleQuantity ?? "?"}` : values.mechanicType === "quantity_threshold_promo" ? `От ${item.promoThresholdQuantity ?? "?"} шт. → PROMO` : `Мин. ${item.minimumQuantity}`}{item.maximumQuantityPerCompany ? ` · лимит ${item.maximumQuantityPerCompany}` : ""}</p></div>)}</div><p className="mt-4 text-sm">{values.terms}</p></div></section><section><h3 className="font-semibold">Готовность к публикации</h3><ul className="mt-2 grid gap-2 sm:grid-cols-2">{checks.map((check) => <li className={check.ok ? "text-emerald-700" : "text-rose-700"} key={check.label}>{check.ok ? "✓" : "○"} {check.label}</li>)}</ul><p className="mt-3 text-sm text-zinc-600">Аудитория: {audienceLabel}. {values.mechanicType === "spend_threshold_promo" ? "Базовые USD-цены выбранной аудитории проверяет сервер при публикации. " : ""}Публикация создаст неизменяемые снимки определения и аудитории.</p>{Object.values(errors).map((error) => <ErrorText key={error}>{error}</ErrorText>)}</section></div>;
}

function Field({ children, label, wide = false, error }: { children: ReactNode; label: string; wide?: boolean; error?: string }) { return <label className={`grid gap-1 text-sm font-medium text-zinc-700 [&>input]:min-h-11 [&>input]:rounded-md [&>input]:border [&>input]:px-3 [&>select]:min-h-11 [&>select]:rounded-md [&>select]:border [&>select]:px-3 [&>textarea]:rounded-md [&>textarea]:border [&>textarea]:p-3 ${wide ? "md:col-span-2" : ""}`}>{label}{children}{error ? <span className="text-xs text-rose-700">{error}</span> : null}</label>; }
function SmallField({ children, label }: { children: ReactNode; label: string }) { return <label className="grid min-w-0 gap-1 text-xs font-medium [&>input]:min-h-10 [&>input]:min-w-0 [&>input]:rounded-md [&>input]:border [&>input]:px-2 [&>select]:min-h-10 [&>select]:min-w-0 [&>select]:rounded-md [&>select]:border [&>select]:px-2">{label}{children}</label>; }
function Check({ checked, label, onChange }: { checked: boolean; label: ReactNode; onChange: () => void }) { return <label className="flex min-h-11 items-center gap-3 rounded-md border border-zinc-200 p-3 text-sm"><input checked={checked} onChange={onChange} type="checkbox" /><span>{label}</span></label>; }
function ErrorText({ children }: { children: ReactNode }) { return <p className="mt-2 text-sm text-rose-700" role="alert">{children}</p>; }
