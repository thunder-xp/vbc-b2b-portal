"use client";
import { BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, Factory, House, Minus, Plus, Shapes, Store, Trash2, Utensils, Warehouse, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionFeedback, actionClassName } from "../../platform-ui";
import { getProposalGeneratorCopy, usePartnerLocale } from "../../partner-locale";
import { getProposalGuidedCopy } from "../../partner-locale/proposal-guided-copy";
import { calculateQuickProposalAction, recordProposalGuidedProgressAction } from "../actions/proposal-generator.actions";
import { CCTV_CAMERA_RESOLUTIONS, CCTV_RECORDER_CHANNELS, type CctvCameraResolution, type CctvConfigurationSummary, type CctvObjectType, type CctvRecorderSelection } from "../services/proposal-generator-calculator";
import { createGuidedZone, GUIDED_ZONE_TYPES, guidedPointCounts, guidedZoneFacts, suggestedGuidedZones, type GuidedZone, type GuidedZoneRequirements, type GuidedZoneType } from "../services/proposal-guided-zones";
import type { GeneratorRequirement } from "../services/proposal-generator";
const objectTypeIcons: Array<{ value: CctvObjectType; icon: LucideIcon }> = [
  { value: "apartment", icon: Building2 }, { value: "house", icon: House }, { value: "office", icon: BriefcaseBusiness }, { value: "retail", icon: Store },
  { value: "warehouse", icon: Warehouse }, { value: "industrial", icon: Factory }, { value: "horeca", icon: Utensils }, { value: "other", icon: Shapes },
];
export const initialGuidedRequirements: GuidedZoneRequirements = {
  objectType: "warehouse", zones: [], system: {
    indoorResolutionMp: 4, outdoorResolutionMp: 4, recorderSelection: "auto", archiveDays: 30, cableLength: 0,
    installationRequested: true, commissioningRequested: true, remoteViewingRequested: true,
    colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
  },
};
export type QuickCalculationResult = { sessionId: string; fingerprint: string; requirements: GeneratorRequirement[]; assumptions: string[]; compatibility: CctvConfigurationSummary };
const controlClassName = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500";
export function ProposalQuickCalculator({ currencyCode, onBack, onCalculated, initialValue, onDraftChange, flowId }: {
  currencyCode: string; onBack: () => void; onCalculated: (result: QuickCalculationResult) => void;
  initialValue?: GuidedZoneRequirements; onDraftChange?: (value: GuidedZoneRequirements) => void;
  flowId?: string;
}) {
  const locale = usePartnerLocale(); const copy = getProposalGeneratorCopy(locale); const guided = getProposalGuidedCopy(locale);
  const requestKey = useRef(crypto.randomUUID());
  const [step, setStep] = useState<1 | 2 | 3>(initialValue ? 3 : 1);
  const [draft, setDraft] = useState(initialValue ?? initialGuidedRequirements);
  const [separate, setSeparate] = useState(Boolean(initialValue && initialValue.system.indoorResolutionMp !== initialValue.system.outdoorResolutionMp));
  const [manualCable, setManualCable] = useState(Boolean(initialValue?.system.cableLength));
  const [message, setMessage] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  const counts = guidedPointCounts(draft.zones); const pointCount = counts.indoorCameraCount + counts.outdoorCameraCount;
  const lastReportedStep = useRef<number>(0);
  useEffect(() => {
    if (!flowId || lastReportedStep.current === step) return;
    lastReportedStep.current = step;
    void recordProposalGuidedProgressAction({ flowId, stage: step === 1 ? "object" : step === 2 ? "zones" : "requirements", objectType: draft.objectType, facts: guidedZoneFacts(draft, true) }).catch(() => undefined);
  }, [step, draft, flowId]);
  const update = (next: GuidedZoneRequirements) => { setDraft(next); onDraftChange?.(next); requestKey.current = crypto.randomUUID(); setMessage(null); };
  const patchSystem = <K extends keyof GuidedZoneRequirements["system"]>(key: K, value: GuidedZoneRequirements["system"][K]) => update({ ...draft, system: { ...draft.system, [key]: value } });
  const patchZone = (id: string, patch: Partial<GuidedZone>) => update({ ...draft, zones: draft.zones.map((zone) => zone.id === id ? { ...zone, ...patch } : zone) });
  const zoneLabel = (type: GuidedZoneType) => type === "storage" && draft.objectType === "warehouse" ? guided.warehouseStorage : guided[type];
  const addZone = (type: GuidedZoneType) => update({ ...draft, zones: [...draft.zones, createGuidedZone(type, crypto.randomUUID())] });
  const calculate = () => startTransition(async () => {
    try { const result = await calculateQuickProposalAction({ guided: draft, currencyCode, requestKey: requestKey.current }); setMessage(result.success ? null : copy.operationFailed); if (result.success) onCalculated(result.data); }
    catch { setMessage(copy.operationFailed); }
  });
  const flagLabels = { colorNight: copy.colorNight, licensePlateRecognition: copy.plateRecognition, videoAnalytics: copy.videoAnalytics, backupPower: copy.backupPower };
  const selectedExtras: string[] = Object.entries(flagLabels).filter(([flag]) => draft.system[flag as keyof typeof flagLabels] || draft.zones.some((zone) => zone.quantity > 0 && flag in zone && zone[flag as "colorNight" | "licensePlateRecognition" | "videoAnalytics"])).map(([, label]) => label);
  if (draft.system.remoteViewingRequested) selectedExtras.push(guided.phone);
  return <section className="grid min-w-0 items-start gap-5 pb-20 lg:pb-0 lg:grid-cols-[minmax(0,1fr)_15rem]">
    <div className="min-w-0 space-y-4 rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3"><button className={actionClassName.secondary} onClick={step === 1 ? onBack : () => setStep(step === 3 ? 2 : 1)} type="button"><ChevronLeft className="size-4" />{copy.back}</button><p aria-live="polite" className="text-sm font-semibold text-emerald-700">{copy.step} {step} {guided.progressOf}</p></div>
      <h2 className="text-xl font-semibold">{step === 1 ? guided.objectStep : step === 2 ? guided.zonesStep : guided.requirementsStep}</h2>
      {step === 1 ? <>
        <p className="text-sm text-zinc-600">{guided.objectQuestion}</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{objectTypeIcons.map((object) => { const ObjectIcon = object.icon; return <button aria-pressed={draft.objectType === object.value} className={`flex min-h-16 items-center gap-2 rounded-md border p-3 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 ${draft.objectType === object.value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-200"}`} key={object.value} onClick={() => update({ ...draft, objectType: object.value })} type="button"><ObjectIcon aria-hidden="true" className="size-5 shrink-0" />{copy[object.value]}{draft.objectType === object.value && <span aria-hidden="true" className="ml-auto">✓</span>}</button>; })}</div>
        <button className={actionClassName.primary} onClick={() => setStep(2)} type="button">{copy.continue}<ChevronRight className="size-4" /></button>
      </> : step === 2 ? <>
        <p className="text-sm font-medium">{guided.suggestions}</p>
        <div className="flex flex-wrap gap-2">{suggestedGuidedZones(draft.objectType).map((type) => <button className={actionClassName.secondary} disabled={draft.zones.length >= 128} key={type} onClick={() => addZone(type)} type="button"><Plus aria-hidden="true" className="size-4" />{zoneLabel(type)}</button>)}</div>
        <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{guided.allZones}</summary><div className="flex flex-wrap gap-2">{GUIDED_ZONE_TYPES.filter((type) => !suggestedGuidedZones(draft.objectType).includes(type)).map((type) => <button className={actionClassName.secondary} disabled={draft.zones.length >= 128} key={type} onClick={() => addZone(type)} type="button"><Plus aria-hidden="true" className="size-4" />{zoneLabel(type)}</button>)}</div></details>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">{draft.zones.map((zone, index) => <article aria-label={`${zoneLabel(zone.type)} ${index + 1}`} className="min-w-0 space-y-3 rounded-md border border-zinc-200 p-3" key={zone.id}>
          <div className="flex items-center justify-between gap-2"><strong className="text-sm">{zoneLabel(zone.type)}</strong><button aria-label={`${guided.remove}: ${zoneLabel(zone.type)} ${index + 1}`} className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-zinc-100" onClick={() => update({ ...draft, zones: draft.zones.filter((item) => item.id !== zone.id) })} type="button"><Trash2 aria-hidden="true" className="size-4" /></button></div>
          {zone.type === "custom" && <label className="block text-xs">{guided.zoneName}<input className={`${controlClassName} mt-1`} maxLength={100} onChange={(event) => patchZone(zone.id, { label: event.target.value })} value={zone.label} /></label>}
          <label className="block text-xs">{guided.zonePlacement}<select className={`${controlClassName} mt-1`} onChange={(event) => patchZone(zone.id, { placement: event.target.value as GuidedZone["placement"] })} value={zone.placement}><option value="indoor">{guided.indoor}</option><option value="outdoor">{guided.outdoor}</option></select></label>
          <Counter decrease={copy.decrease} increase={copy.increase} label={`${guided.points}: ${zoneLabel(zone.type)} ${index + 1}`} onChange={(quantity) => patchZone(zone.id, { quantity })} value={zone.quantity} />
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{guided.zoneOptions}</summary><div className="space-y-2">{(["colorNight", "licensePlateRecognition", "videoAnalytics"] as const).map((flag) => <Toggle checked={zone[flag]} key={flag} label={flagLabels[flag]} onChange={(value) => patchZone(zone.id, { [flag]: value })} />)}</div></details>
        </article>)}</div>
        {!pointCount && <p className="text-sm text-zinc-600">{guided.empty}</p>}<button className={actionClassName.primary} disabled={!pointCount} onClick={() => setStep(3)} type="button">{copy.continue}<ChevronRight className="size-4" /></button>
      </> : <>
        <fieldset className="space-y-3"><legend className="font-semibold">{guided.detail}</legend><div className="grid gap-2 sm:grid-cols-2">{CCTV_CAMERA_RESOLUTIONS.map((mp, index) => <button aria-pressed={!separate && draft.system.indoorResolutionMp === mp && draft.system.outdoorResolutionMp === mp} className={`min-h-16 rounded-md border p-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-emerald-500 ${!separate && draft.system.indoorResolutionMp === mp && draft.system.outdoorResolutionMp === mp ? "border-emerald-600 bg-emerald-50" : "border-zinc-200"}`} key={mp} onClick={() => { setSeparate(false); update({ ...draft, system: { ...draft.system, indoorResolutionMp: mp, outdoorResolutionMp: mp } }); }} type="button"><strong className="block">{[guided.basic, guided.standard, guided.detailed, guided.maximum][index]}{!separate && draft.system.indoorResolutionMp === mp && draft.system.outdoorResolutionMp === mp && <span aria-hidden="true" className="ml-2">✓</span>}</strong>{mp} {copy.megapixels}</button>)}</div>
          <Toggle checked={separate} label={guided.separate} onChange={(value) => { setSeparate(value); if (!value) patchSystem("outdoorResolutionMp", draft.system.indoorResolutionMp); }} />
          {separate && <div className="grid gap-3 sm:grid-cols-2">{(["indoorResolutionMp", "outdoorResolutionMp"] as const).map((key) => <label className="text-sm" key={key}>{key === "indoorResolutionMp" ? copy.indoorCameras : copy.outdoorCameras}<select className={`${controlClassName} mt-1`} onChange={(event) => patchSystem(key, Number(event.target.value) as CctvCameraResolution)} value={draft.system[key]}>{CCTV_CAMERA_RESOLUTIONS.map((mp) => <option key={mp} value={mp}>{mp} {copy.megapixels}</option>)}</select></label>)}</div>}
        </fieldset>
        <label className="block font-semibold">{guided.archive}<select className={`${controlClassName} mt-2 font-normal`} onChange={(event) => patchSystem("archiveDays", Number(event.target.value))} value={draft.system.archiveDays}>{[7,14,30,60,90].map((days) => <option key={days} value={days}>{days} {copy.days}</option>)}</select></label>
        <fieldset><legend className="mb-3 font-semibold">{guided.capabilities}</legend><div className="grid gap-2 sm:grid-cols-2">{(["colorNight", "licensePlateRecognition", "videoAnalytics", "backupPower"] as const).map((flag) => <Toggle checked={draft.system[flag]} key={flag} label={flagLabels[flag]} onChange={(value) => patchSystem(flag, value)} />)}<Toggle checked={draft.system.remoteViewingRequested} label={guided.phone} onChange={(value) => patchSystem("remoteViewingRequested", value)} /></div></fieldset>
        <fieldset><legend className="mb-3 font-semibold">{guided.services}</legend><div className="grid gap-2 sm:grid-cols-2"><Toggle checked={draft.system.installationRequested} label={guided.installation} onChange={(value) => patchSystem("installationRequested", value)} /><Toggle checked={draft.system.commissioningRequested} label={guided.commissioning} onChange={(value) => patchSystem("commissioningRequested", value)} /><Toggle checked={draft.system.remoteViewingRequested} label={guided.remote} onChange={(value) => patchSystem("remoteViewingRequested", value)} /></div></fieldset>
        <p className="text-sm text-zinc-600">{draft.system.recorderSelection === "auto" ? guided.autoRecorder : `${copy.recorder}: ${draft.system.recorderSelection === "none" ? copy.notNeeded : draft.system.recorderSelection}`}</p>
        <details className="rounded-md border border-zinc-200"><summary className="min-h-11 cursor-pointer p-3 text-sm font-semibold">{guided.advanced}</summary><div className="space-y-3 border-t border-zinc-200 p-3">
          <label className="block text-sm">{copy.recorderChannelCount}<select className={`${controlClassName} mt-1`} onChange={(event) => patchSystem("recorderSelection", event.target.value === "auto" || event.target.value === "none" ? event.target.value : Number(event.target.value) as CctvRecorderSelection)} value={draft.system.recorderSelection}><option value="auto">{copy.automatic}</option><option value="none">{copy.notNeeded}</option>{CCTV_RECORDER_CHANNELS.map((channels) => <option key={channels} value={channels}>{channels}</option>)}</select></label>
          <label className="block text-sm">{copy.cable}<select className={`${controlClassName} mt-1`} onChange={(event) => { const manual = event.target.value === "manual"; setManualCable(manual); if (!manual) patchSystem("cableLength", 0); }} value={manualCable ? "manual" : "later"}><option value="later">{guided.cableLater}</option><option value="manual">{guided.cableManual}</option></select></label>
          {manualCable && <label className="block text-sm">{copy.cableApproximate}<input className={`${controlClassName} mt-1`} max={20000} min={0} onChange={(event) => patchSystem("cableLength", Math.max(0, Math.min(20000, Math.round(Number(event.target.value)))))} type="number" value={draft.system.cableLength} /></label>}
        </div></details>{message && <ActionFeedback kind="error" message={message} />}
      </>}
    </div>
    <aside aria-label={guided.demand} className="min-w-0 rounded-md border border-zinc-200 bg-white p-4 lg:sticky lg:top-20"><h3 className="font-semibold">{guided.demand}</h3><dl aria-live="polite" className="mt-3 space-y-2 text-sm">{[[copy.object, copy[draft.objectType]], [guided.zones, draft.zones.length], [guided.points, pointCount], [guided.indoor, counts.indoorCameraCount], [guided.outdoor, counts.outdoorCameraCount], [guided.archive, `${draft.system.archiveDays} ${copy.days}`]].map(([label, value]) => <div className="flex justify-between gap-3" key={label}><dt className="text-zinc-600">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl><p className="mt-3 text-xs text-zinc-600">{selectedExtras.length ? selectedExtras.join(" · ") : guided.noExtras}</p><div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:static lg:mt-4 lg:border-0 lg:p-0"><button className={`${actionClassName.primary} w-full`} disabled={pending || !pointCount || !currencyCode} onClick={step === 3 ? calculate : () => setStep(3)} type="button">{pending ? copy.calculating : guided.select}</button></div></aside>
  </section>;
}
function Counter({ label, value, onChange, decrease, increase }: { label: string; value: number; onChange: (value: number) => void; decrease: string; increase: string }) {
  return <div><span className="text-xs">{label}</span><div className="mt-1 grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-md border border-zinc-300"><button aria-label={`${decrease}: ${label}`} className="grid min-h-11 place-items-center" disabled={value <= 0} onClick={() => onChange(value - 1)} type="button"><Minus aria-hidden="true" className="size-4" /></button><input aria-label={label} className="min-w-0 text-center text-sm font-semibold" max={128} min={0} onChange={(event) => onChange(Math.max(0, Math.min(128, Math.round(Number(event.target.value)))))} type="number" value={value} /><button aria-label={`${increase}: ${label}`} className="grid min-h-11 place-items-center" disabled={value >= 128} onClick={() => onChange(value + 1)} type="button"><Plus aria-hidden="true" className="size-4" /></button></div></div>;
}
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"><input checked={checked} className="size-4 shrink-0 accent-emerald-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>;
}
