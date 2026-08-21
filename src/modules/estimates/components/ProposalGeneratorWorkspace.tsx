"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Check, ChevronLeft, CircleCheck, Loader2, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { getProposalGeneratorCopy, usePartnerLocale, type ProposalGeneratorCopy } from "../../partner-locale";
import { createGeneratedEstimateAction, generateProposalDraftAction } from "../actions/proposal-generator.actions";
import { GENERATOR_SECTIONS, summarizeGeneratorPricing, type GeneratorRequirement } from "../services/proposal-generator";
import { automaticRecorderChannels, type CctvConfigurationSummary } from "../services/proposal-generator-calculator";
import type { FinalCustomer } from "../types";
import { FinalCustomerPicker } from "./FinalCustomerPicker";
import { ProposalGeneratorReview } from "./ProposalGeneratorReview";

const ProposalQuickCalculator = dynamic(() => import("./ProposalQuickCalculator").then((module) => module.ProposalQuickCalculator), {
  loading: GeneratorLoading,
});
type GeneratorMode = "description" | "quick_calculation";
const inputClass = "min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const subscribeToSessionMode = () => () => undefined;
const readSessionMode = (): GeneratorMode | null => {
  const saved = window.sessionStorage.getItem("novotech-proposal-generator-mode");
  return saved === "description" || saved === "quick_calculation" ? saved : null;
};

export function ProposalGeneratorWorkspace({ currencies }: { currencies: string[] }) {
  const copy = getProposalGeneratorCopy(usePartnerLocale());
  const router = useRouter();
  const generationKey = useRef(crypto.randomUUID());
  const creationKey = useRef(crypto.randomUUID());
  const createPanelRef = useRef<HTMLElement>(null);
  const [pending, startTransition] = useTransition();
  const storedMode = useSyncExternalStore(subscribeToSessionMode, readSessionMode, () => null);
  const [selectedMode, setSelectedMode] = useState<GeneratorMode | null | undefined>(undefined);
  const mode = selectedMode === undefined ? storedMode : selectedMode;
  const [requirement, setRequirement] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currencies.includes("MDL") ? "MDL" : currencies[0] ?? "USD");
  const [vatMode, setVatMode] = useState<"none" | "included">("none");
  const [session, setSession] = useState<{ id: string; fingerprint: string } | null>(null);
  const [requirements, setRequirements] = useState<GeneratorRequirement[]>([]);
  const [compatibility, setCompatibility] = useState<CctvConfigurationSummary | null>(null);
  const [customer, setCustomer] = useState<FinalCustomer | null>(null);
  const [projectName, setProjectName] = useState("");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pricingSummary = summarizeGeneratorPricing(requirements, currencyCode);
  const recorder = requirements.find((line) => line.id === "cctv-nvr");
  const unverifiedRecorderReplacement = Boolean(
    recorder?.governedResolvedId && recorder.resolvedId !== recorder.governedResolvedId,
  );
  const hasBlockingCompatibility = Boolean(
    compatibility?.issues.some((issue) => issue.severity === "blocking") || unverifiedRecorderReplacement,
  );
  const incompatibleLineIds = compatibility?.issues.flatMap((issue) => issue.severity !== "blocking" ? []
    : issue.code.startsWith("recorder_") ? ["cctv-nvr"]
      : issue.code === "storage_incompatible" ? requirements.filter((line) => line.id.startsWith("cctv-storage")).map((line) => line.id) : []) ?? [];

  const chooseMode = (value: GeneratorMode | null) => {
    setSelectedMode(value); setSession(null); setRequirements([]); setCompatibility(null); setMessage(null); setCreatePanelOpen(false);
    if (value) window.sessionStorage.setItem("novotech-proposal-generator-mode", value);
    else window.sessionStorage.removeItem("novotech-proposal-generator-mode");
  };
  const generate = () => startTransition(async () => {
    const result = await generateProposalDraftAction({ requirement, requestKey: generationKey.current });
    setMessage(result.success ? null : copy.operationFailed);
    if (result.success) { setSession({ id: result.data.sessionId, fingerprint: result.data.fingerprint }); setRequirements(result.data.requirements); }
  });
  const create = () => startTransition(async () => {
    if (!session) { setMessage(copy.unavailable); return; }
    if (!customer) { setMessage(copy.chooseCustomer); return; }
    try {
      const result = await createGeneratedEstimateAction({
        sessionId: session.id, sessionFingerprint: session.fingerprint, finalCustomerId: customer.id,
        name: projectName.trim() || `${copy.estimateFor} ${customer.displayName}`, projectName, currencyCode, vatMode, validityDays: 14,
        requestKey: creationKey.current, requirements,
      });
      setMessage(result.success ? null : copy.operationFailed);
      if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}?generatorSession=${session.id}`);
    } catch {
      setMessage(copy.createFailed);
    }
  });
  const openCreatePanel = () => {
    setCreatePanelOpen(true); setMessage(null);
    window.setTimeout(() => createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  if (!session && !mode) return <ModeChoice copy={copy} onChoose={chooseMode} />;
  if (!session && mode === "quick_calculation") return <div className="mx-auto w-full max-w-5xl space-y-6">
    <GeneratorHeader copy={copy} description={copy.quickDescription} title={copy.quickTitle} />
    <ProposalQuickCalculator currencyCode={currencyCode} onBack={() => chooseMode(null)} onCalculated={(result) => {
      setSession({ id: result.sessionId, fingerprint: result.fingerprint }); setRequirements(result.requirements); setCompatibility(result.compatibility);
    }} />
  </div>;
  if (!session) return <div className="mx-auto w-full max-w-4xl space-y-6">
    <GeneratorHeader copy={copy} description={copy.descriptionHint} title={copy.descriptionTitle} />
    <section className="space-y-5 border-y border-zinc-200 bg-white px-4 py-6 sm:px-6">
      <button className={actionClassName.secondary} onClick={() => chooseMode(null)} type="button"><ChevronLeft className="size-4" />{copy.chooseMethod}</button>
      <FormField helperText={copy.needDescriptionHint} label={copy.needDescription} required>{(props) => <textarea {...props} className="min-h-40 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" maxLength={4000} onChange={(event) => { setRequirement(event.target.value); generationKey.current = crypto.randomUUID(); }} placeholder={copy.needPlaceholder} value={requirement} />}</FormField>
      {message && <ActionFeedback kind="error" message={message} />}
      <button className={actionClassName.primary} disabled={pending || requirement.trim().length < 10 || !currencies.length} onClick={generate} type="button"><WandSparkles className="size-4" />{pending ? copy.generating : copy.generateDraft}</button>
    </section>
  </div>;

  return <div className="mx-auto w-full max-w-7xl space-y-5 overflow-x-clip">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">{copy.resultStep}</p><h1 className="mt-1 text-2xl font-semibold">{copy.reviewConfiguration}</h1><p className="mt-1 max-w-3xl text-sm text-zinc-600">{copy.reviewHint}</p></div><button className={actionClassName.secondary} onClick={() => { setSession(null); setMessage(null); }} type="button"><ChevronLeft className="size-4" />{copy.changeParameters}</button></header>
    {mode === "quick_calculation" && compatibility && <CctvCompatibilitySummary copy={copy} hasUnverifiedRecorderReplacement={unverifiedRecorderReplacement} requirements={requirements} value={compatibility} />}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <ProposalGeneratorReview currencyCode={currencyCode} incompatibleLineIds={incompatibleLineIds} onChange={setRequirements} requirements={requirements} />
      <CommercialSummary copy={copy} currencyCode={currencyCode} hasBlockingCompatibility={hasBlockingCompatibility} onCreate={openCreatePanel} pricingSummary={pricingSummary} requirements={requirements} vatMode={vatMode} />
    </div>
    {createPanelOpen && <section className="grid scroll-mt-24 gap-4 rounded-md border border-zinc-200 bg-white p-4 md:grid-cols-2" ref={createPanelRef}>
      <div className="md:col-span-2"><FinalCustomerPicker onChange={setCustomer} value={customer?.id ?? null} /></div>
      <FormField label={copy.projectObject}>{(props) => <input {...props} className={inputClass} maxLength={200} onChange={(event) => setProjectName(event.target.value)} value={projectName} />}</FormField>
      <FormField label={copy.currency} required>{(props) => <select {...props} className={inputClass} onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>}</FormField>
      <FormField label={copy.vat} required>{(props) => <select {...props} className={inputClass} onChange={(event) => setVatMode(event.target.value as "none" | "included")} value={vatMode}><option value="none">{copy.vatNone}</option><option value="included">{copy.vatIncluded}</option></select>}</FormField>
      <div className="md:col-span-2"><button className={actionClassName.primary} disabled={pending || !requirements.length || hasBlockingCompatibility} onClick={create} type="button">{pending ? <><Loader2 className="size-4 animate-spin" />{copy.creating}</> : <><Check className="size-4" />{copy.createEstimate}</>}</button></div>
    </section>}
    {message && <ActionFeedback kind="error" message={message} />}
  </div>;
}

function CctvCompatibilitySummary({ value, requirements, hasUnverifiedRecorderReplacement, copy }: { value: CctvConfigurationSummary; requirements: GeneratorRequirement[]; hasUnverifiedRecorderReplacement: boolean; copy: ProposalGeneratorCopy }) {
  const cameraCount = requirements.filter((line) => line.id === "cctv-indoor" || line.id === "cctv-outdoor").reduce((sum, line) => sum + line.quantity, 0);
  const minimumChannels = automaticRecorderChannels(cameraCount);
  const blocking = hasUnverifiedRecorderReplacement || value.issues.some((issue) => issue.severity === "blocking");
  const warningCount = value.issues.filter((issue) => issue.severity === "warning").length;
  const driveText = value.archive.selectedDrives.length
    ? value.archive.selectedDrives.map((drive) => `${drive.quantity} × ${drive.capacityTb} TB`).join(" + ") : copy.driveRequired;
  const status = blocking ? { title: copy.configurationBlocking, description: copy.configurationBlockingHint, className: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle }
    : warningCount ? { title: copy.configurationWarning, description: warningCount === 1 ? copy.recommendationOne : copy.recommendationMany, className: "border-amber-200 bg-amber-50 text-amber-950", icon: AlertTriangle }
      : { title: copy.configurationReady, description: copy.configurationReadyHint, className: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CircleCheck };
  const StatusIcon = status.icon;
  return <section className="space-y-3" aria-label={copy.compatibility}>
    <div className={`flex gap-3 rounded-md border p-4 ${status.className}`}><StatusIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><div><h2 className="font-semibold">{status.title}</h2><p className="mt-1 text-sm">{status.description}</p></div></div>
    <div className="grid gap-3 text-sm md:grid-cols-3">
      <DecisionCard title={copy.recorder}><p>{cameraCount} {copy.cameras} → {copy.minimumRequired} {minimumChannels ?? copy.clarify} {copy.channels}.</p><p className="mt-1 text-zinc-600">{copy.selected}: {value.recorder.channels ? `${copy.nvrFor} ${value.recorder.channels} ${copy.channels}` : copy.notSelected}.</p>{minimumChannels && value.recorder.channels && value.recorder.channels > minimumChannels && <p className="mt-1 text-zinc-600">{copy.largerRecorderHint}</p>}</DecisionCard>
      <DecisionCard title={copy.archive}><p>{copy.estimatedCapacity}: ~{value.archive.requiredCapacityTb} TB</p><p className="mt-1 text-zinc-600">{copy.selected}: {driveText}</p><p className="mt-1 text-zinc-600">{copy.physicalCapacity}: {value.archive.physicalCapacityTb == null ? copy.notDefined : `${value.archive.physicalCapacityTb} TB`}</p></DecisionCard>
      <DecisionCard title="PoE"><p>{copy.integratedPoe}: {value.recorder.integratedPoePorts == null ? copy.dataClarified : `${value.recorder.integratedPoePorts} ${copy.ports}`}</p><p className="mt-1 text-zinc-600">{copy.additionallyRequired}: {value.externalPoePortsRequired} {copy.ports}</p>{value.externalPoePortsRequired > 0 && <p className="mt-1 text-zinc-600">{copy.poeAdded}</p>}</DecisionCard>
    </div>
    {(value.issues.length > 0 || hasUnverifiedRecorderReplacement) && <div className="space-y-2">
      {hasUnverifiedRecorderReplacement && <p className="border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"><strong>{copy.incompatible}: </strong>{copy.recorderReplacementUnverified}</p>}
      {value.issues.map((issue) => <p className={issue.severity === "blocking" ? "border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800" : "border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900"} key={issue.code}><strong>{issue.severity === "blocking" ? `${copy.incompatible}: ` : `${copy.recommendation}: `}</strong>{compatibilityIssueLabel(issue.code, issue.message, copy)}</p>)}
    </div>}
  </section>;
}

function DecisionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-4"><h3 className="font-semibold">{title}</h3><div className="mt-2">{children}</div></div>;
}

function CommercialSummary({ requirements, currencyCode, pricingSummary, vatMode, hasBlockingCompatibility, onCreate, copy }: {
  requirements: GeneratorRequirement[]; currencyCode: string; pricingSummary: ReturnType<typeof summarizeGeneratorPricing>;
  vatMode: "none" | "included"; hasBlockingCompatibility: boolean; onCreate: () => void; copy: ProposalGeneratorCopy;
}) {
  const unpricedCount = requirements.filter((line) => line.sellingUnitPrice == null || line.sellingCurrencyCode !== currencyCode).length;
  const sectionTotals = GENERATOR_SECTIONS.map((section) => ({ ...section, label: generatorSectionLabel(section.key, copy), total: requirements.filter((line) => line.sectionKey === section.key).reduce((sum, line) => sum + (line.sellingUnitPrice != null && line.sellingCurrencyCode === currencyCode ? line.sellingUnitPrice * line.quantity : 0), 0) }));
  const net = vatMode === "included" ? pricingSummary.knownTotal / 1.2 : pricingSummary.knownTotal;
  const vat = pricingSummary.knownTotal - net;
  return <aside className="rounded-md border border-zinc-200 bg-white p-4 xl:sticky xl:top-20" aria-label={copy.calculation}>
    <h2 className="font-semibold">{copy.calculation}</h2>
    <dl className="mt-4 space-y-2 text-sm">{sectionTotals.map((section) => <div className="flex justify-between gap-3" key={section.key}><dt className="text-zinc-600">{section.label}</dt><dd className="font-medium">{section.total.toFixed(2)} {currencyCode}</dd></div>)}</dl>
    <div className="mt-4 space-y-2 border-t border-zinc-200 pt-4 text-sm">{vatMode === "included" && <><p className="flex justify-between gap-3"><span>{copy.totalWithoutVat}</span><strong>{net.toFixed(2)} {currencyCode}</strong></p><p className="flex justify-between gap-3"><span>{copy.vat}</span><strong>{vat.toFixed(2)} {currencyCode}</strong></p></>}<p><span className="block text-zinc-500">{unpricedCount ? copy.knownCost : copy.estimatedTotal}</span><strong className="mt-1 block text-xl">{pricingSummary.knownTotal.toFixed(2)} {currencyCode}</strong></p>{unpricedCount > 0 && <p className="rounded-md bg-amber-50 p-2 text-amber-900">{copy.missingPricePrefix}: {unpricedCount}.</p>}</div>
    <button className={`${actionClassName.primary} mt-4 w-full`} disabled={!requirements.length || hasBlockingCompatibility} onClick={onCreate} type="button"><Check className="size-4" />{copy.createEstimate}</button>
    <p className="mt-3 text-xs text-zinc-500">{copy.calculationDisclaimer}</p>
  </aside>;
}

function ModeChoice({ onChoose, copy }: { onChoose: (mode: GeneratorMode) => void; copy: ProposalGeneratorCopy }) {
  return <div className="mx-auto w-full max-w-4xl space-y-6"><GeneratorHeader copy={copy} description={copy.methodQuestion} title={copy.generatorTitle} /><div className="grid gap-3 sm:grid-cols-2">
    <button className="min-h-28 rounded-md border border-zinc-200 bg-white p-5 text-left hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300" onClick={() => onChoose("quick_calculation")} type="button"><strong className="text-lg">{copy.quickTitle}</strong><span className="mt-2 block text-sm text-zinc-600">{copy.quickMethodHint}</span></button>
    <button className="min-h-28 rounded-md border border-zinc-200 bg-white p-5 text-left hover:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-300" onClick={() => onChoose("description")} type="button"><strong className="text-lg">{copy.descriptionTitle}</strong><span className="mt-2 block text-sm text-zinc-600">{copy.descriptionMethodHint}</span></button>
  </div></div>;
}
function GeneratorHeader({ title, description, copy }: { title: string; description: string; copy: ProposalGeneratorCopy }) {
  return <header><p className="text-sm font-semibold text-emerald-700">{copy.estimatesAndProposals}</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{title}</h1><p className="mt-2 max-w-2xl text-sm text-zinc-600">{description}</p></header>;
}

function GeneratorLoading() {
  const copy = getProposalGeneratorCopy(usePartnerLocale());
  return <p className="py-8 text-sm text-zinc-500">{copy.loading}</p>;
}

function generatorSectionLabel(key: GeneratorRequirement["sectionKey"], copy: ProposalGeneratorCopy): string {
  if (key === "equipment") return copy.equipment;
  if (key === "installation_materials") return copy.installationMaterials;
  if (key === "installation_works") return copy.installationWorks;
  return copy.commissioningWorks;
}

function compatibilityIssueLabel(code: string, fallback: string, copy: ProposalGeneratorCopy): string {
  const labels: Record<string, string> = {
    recorder_not_selected: copy.issueRecorderNotSelected,
    recorder_above_recommended_tier: copy.issueRecorderTier,
    insufficient_poe: copy.issueInsufficientPoe,
    recorder_channels_insufficient: copy.issueRecorderChannels,
    recorder_metadata_unverified: copy.issueRecorderMetadata,
    storage_incompatible: copy.issueStorage,
  };
  return labels[code] ?? fallback;
}
