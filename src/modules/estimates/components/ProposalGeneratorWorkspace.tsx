"use client";

import dynamic from "next/dynamic";
import { Check, ChevronLeft, Loader2, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { createGeneratedEstimateAction, generateProposalDraftAction } from "../actions/proposal-generator.actions";
import { summarizeGeneratorPricing, type GeneratorRequirement } from "../services/proposal-generator";
import type { FinalCustomer } from "../types";
import { FinalCustomerPicker } from "./FinalCustomerPicker";
import { ProposalGeneratorReview } from "./ProposalGeneratorReview";

const ProposalQuickCalculator = dynamic(() => import("./ProposalQuickCalculator").then((module) => module.ProposalQuickCalculator), {
  loading: () => <p className="py-8 text-sm text-zinc-500">Загрузка расчёта...</p>,
});
type GeneratorMode = "description" | "quick_calculation";
const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const subscribeToSessionMode = () => () => undefined;
const readSessionMode = (): GeneratorMode | null => {
  const saved = window.sessionStorage.getItem("novotech-proposal-generator-mode");
  return saved === "description" || saved === "quick_calculation" ? saved : null;
};

export function ProposalGeneratorWorkspace({ currencies }: { currencies: string[] }) {
  const router = useRouter();
  const generationKey = useRef(crypto.randomUUID());
  const creationKey = useRef(crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const storedMode = useSyncExternalStore(subscribeToSessionMode, readSessionMode, () => null);
  const [selectedMode, setSelectedMode] = useState<GeneratorMode | null | undefined>(undefined);
  const mode = selectedMode === undefined ? storedMode : selectedMode;
  const [requirement, setRequirement] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currencies.includes("MDL") ? "MDL" : currencies[0] ?? "USD");
  const [vatMode, setVatMode] = useState<"none" | "included">("none");
  const [session, setSession] = useState<{ id: string; fingerprint: string } | null>(null);
  const [requirements, setRequirements] = useState<GeneratorRequirement[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [customer, setCustomer] = useState<FinalCustomer | null>(null);
  const [projectName, setProjectName] = useState("");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pricingSummary = summarizeGeneratorPricing(requirements, currencyCode);

  const chooseMode = (value: GeneratorMode | null) => {
    setSelectedMode(value); setSession(null); setRequirements([]); setAssumptions([]); setMessage(null); setCreatePanelOpen(false);
    if (value) window.sessionStorage.setItem("novotech-proposal-generator-mode", value);
    else window.sessionStorage.removeItem("novotech-proposal-generator-mode");
  };
  const generate = () => startTransition(async () => {
    const result = await generateProposalDraftAction({ requirement, requestKey: generationKey.current });
    setMessage(result.message);
    if (result.success) { setSession({ id: result.data.sessionId, fingerprint: result.data.fingerprint }); setRequirements(result.data.requirements); }
  });
  const create = () => startTransition(async () => {
    if (!session || !customer) return;
    const result = await createGeneratedEstimateAction({
      sessionId: session.id, sessionFingerprint: session.fingerprint, finalCustomerId: customer.id,
      name: projectName.trim() || `КП для ${customer.displayName}`, projectName, currencyCode, vatMode, validityDays: 14,
      requestKey: creationKey.current, requirements,
    });
    setMessage(result.message);
    if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}?generatorSession=${session.id}`);
  });

  if (!session && !mode) return <ModeChoice onChoose={chooseMode} />;
  if (!session && mode === "quick_calculation") return <div className="mx-auto w-full max-w-5xl space-y-6">
    <GeneratorHeader description="Видеонаблюдение · ориентировочный подбор без выдуманных товаров и цен." title="Быстрый расчёт" />
    <ProposalQuickCalculator currencyCode={currencyCode} onBack={() => chooseMode(null)} onCalculated={(result) => {
      setSession({ id: result.sessionId, fingerprint: result.fingerprint }); setRequirements(result.requirements); setAssumptions(result.assumptions);
    }} />
  </div>;
  if (!session) return <div className="mx-auto w-full max-w-4xl space-y-6">
    <GeneratorHeader description="Опишите задачу своими словами. Генератор выделит требования, не придумывая товары, цены или остатки." title="По описанию" />
    <section className="space-y-5 border-y border-zinc-200 bg-white px-4 py-6 sm:px-6">
      <button className={actionClassName.secondary} onClick={() => chooseMode(null)} type="button"><ChevronLeft className="size-4" />Выбрать способ</button>
      <FormField helperText="Укажите количества, помещения и необходимые работы. До 4 000 символов." label="Краткое описание потребности" required>{(props) => <textarea {...props} className="min-h-40 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" maxLength={4000} onChange={(event) => { setRequirement(event.target.value); generationKey.current = crypto.randomUUID(); }} placeholder="Нужно видеонаблюдение для склада: 12 камер внутри, 4 снаружи, архив 30 дней, монтаж и настройка." value={requirement} />}</FormField>
      {message && <ActionFeedback kind="error" message={message} />}
      <button className={actionClassName.primary} disabled={pending || requirement.trim().length < 10 || !currencies.length} onClick={generate} type="button"><WandSparkles className="size-4" />{pending ? "Формирование..." : "Сформировать черновик"}</button>
    </section>
  </div>;

  return <div className="mx-auto w-full max-w-6xl space-y-5 overflow-x-clip">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Шаг 3 из 3 · Результат</p><h1 className="mt-1 text-2xl font-semibold">Проверьте структуру сметы</h1><p className="mt-1 text-sm text-zinc-600">Точные соответствия выбираются только вами. Неразрешённые позиции попадут в смету без цены.</p></div><button className={actionClassName.secondary} onClick={() => { setSession(null); setMessage(null); }} type="button"><ChevronLeft className="size-4" />Изменить исходные данные</button></header>
    <ProposalGeneratorReview currencyCode={currencyCode} onChange={setRequirements} requirements={requirements} />
    {mode === "quick_calculation" && <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Ориентировочная стоимость известных позиций</strong>{pricingSummary.knownTotal > 0 && <p className="mt-1 text-lg font-semibold">{pricingSummary.knownTotal.toFixed(2)} {currencyCode}</p>}<p className="mt-1">Расчёт ориентировочный и не является коммерческим предложением.</p>{pricingSummary.unpricedWorks > 0 && <p className="mt-1 font-medium">Для {pricingSummary.unpricedWorks} работ требуется указать цену.</p>}{assumptions.map((item) => <p className="mt-1 text-xs" key={item}>{item}</p>)}</section>}
    {createPanelOpen && <section className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 md:grid-cols-2">
      <div className="md:col-span-2"><FinalCustomerPicker onChange={setCustomer} value={customer?.id ?? null} /></div>
      <FormField label="Проект / объект">{(props) => <input {...props} className={inputClass} maxLength={200} onChange={(event) => setProjectName(event.target.value)} value={projectName} />}</FormField>
      <FormField label="Валюта" required>{(props) => <select {...props} className={inputClass} onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>}</FormField>
      <FormField label="НДС" required>{(props) => <select {...props} className={inputClass} onChange={(event) => setVatMode(event.target.value as "none" | "included")} value={vatMode}><option value="none">НДС не применяется</option><option value="included">НДС применяется (20%)</option></select>}</FormField>
      <div className="md:col-span-2"><button className={actionClassName.primary} disabled={pending || !customer || !requirements.length} onClick={create} type="button">{pending ? <><Loader2 className="size-4 animate-spin" />Создание...</> : <><Check className="size-4" />Создать смету</>}</button></div>
    </section>}
    {message && <ActionFeedback kind="error" message={message} />}
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur"><p className="text-sm text-zinc-600">{requirements.length} позиций · {requirements.filter((line) => line.resolution === "unresolved").length} требуют уточнения</p><button className={actionClassName.primary} disabled={!requirements.length} onClick={() => setCreatePanelOpen(true)} type="button"><Check className="size-4" />Создать смету</button></div>
  </div>;
}

function ModeChoice({ onChoose }: { onChoose: (mode: GeneratorMode) => void }) {
  return <div className="mx-auto w-full max-w-4xl space-y-6"><GeneratorHeader description="Как хотите подготовить расчёт?" title="Генератор КП" /><div className="grid gap-3 sm:grid-cols-2">
    <button className="min-h-28 rounded-md border border-zinc-200 bg-white p-5 text-left hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300" onClick={() => onChoose("quick_calculation")} type="button"><strong className="text-lg">Быстрый расчёт</strong><span className="mt-2 block text-sm text-zinc-600">Ответьте на несколько вопросов о проекте.</span></button>
    <button className="min-h-28 rounded-md border border-zinc-200 bg-white p-5 text-left hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300" onClick={() => onChoose("description")} type="button"><strong className="text-lg">По описанию</strong><span className="mt-2 block text-sm text-zinc-600">Опишите задачу своими словами.</span></button>
  </div></div>;
}
function GeneratorHeader({ title, description }: { title: string; description: string }) {
  return <header><p className="text-sm font-semibold text-emerald-700">Сметы и КП</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{title}</h1><p className="mt-2 max-w-2xl text-sm text-zinc-600">{description}</p></header>;
}
