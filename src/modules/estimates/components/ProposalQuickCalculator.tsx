"use client";

import {
  BriefcaseBusiness, Building2, Cable, Camera, ChevronLeft, ChevronRight, Cctv, Factory, HardDrive,
  House, Minus, Plus, Server, Shapes, Store, Utensils, Warehouse, type LucideIcon,
} from "lucide-react";
import { type ReactNode, useRef, useState, useTransition } from "react";

import { ActionFeedback, actionClassName } from "../../platform-ui";
import { getProposalGeneratorCopy, usePartnerLocale, type ProposalGeneratorCopy } from "../../partner-locale";
import { calculateQuickProposalAction } from "../actions/proposal-generator.actions";
import {
  CCTV_CAMERA_RESOLUTIONS, CCTV_RECORDER_CHANNELS, type CctvCalculatorInput,
  type CctvCameraResolution, type CctvConfigurationSummary, type CctvObjectType, type CctvRecorderSelection,
} from "../services/proposal-generator-calculator";
import type { GeneratorRequirement } from "../services/proposal-generator";

const objectTypeIcons: Array<{ value: CctvObjectType; icon: LucideIcon }> = [
  { value: "apartment", icon: Building2 }, { value: "house", icon: House },
  { value: "office", icon: BriefcaseBusiness }, { value: "retail", icon: Store },
  { value: "warehouse", icon: Warehouse }, { value: "industrial", icon: Factory },
  { value: "horeca", icon: Utensils }, { value: "other", icon: Shapes },
];

const defaults: CctvCalculatorInput = {
  objectType: "warehouse", indoorCameraCount: 8, indoorResolutionMp: 6,
  outdoorCameraCount: 4, outdoorResolutionMp: 4, recorderSelection: "auto", archiveDays: 30, cableLength: 300,
  installationRequested: true, commissioningRequested: true, remoteViewingRequested: true,
  colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
};

export type QuickCalculationResult = { sessionId: string; fingerprint: string; requirements: GeneratorRequirement[]; assumptions: string[]; compatibility: CctvConfigurationSummary };

export function ProposalQuickCalculator({ currencyCode, onBack, onCalculated }: {
  currencyCode: string; onBack: () => void; onCalculated: (result: QuickCalculationResult) => void;
}) {
  const copy = getProposalGeneratorCopy(usePartnerLocale());
  const requestKey = useRef(crypto.randomUUID());
  const [step, setStep] = useState<1 | 2>(1);
  const [parameters, setParameters] = useState(defaults);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const patch = <K extends keyof CctvCalculatorInput>(key: K, value: CctvCalculatorInput[K]) => {
    setParameters((current) => ({ ...current, [key]: value })); requestKey.current = crypto.randomUUID();
  };
  const calculate = () => startTransition(async () => {
    const result = await calculateQuickProposalAction({ parameters, currencyCode, requestKey: requestKey.current });
    setMessage(result.success ? null : copy.operationFailed);
    if (result.success) onCalculated(result.data);
  });

  return <section className="space-y-5 border-y border-zinc-200 bg-white px-4 py-5 sm:px-6">
    <div className="flex items-center justify-between gap-3">
      <button className={actionClassName.secondary} onClick={step === 1 ? onBack : () => setStep(1)} type="button"><ChevronLeft className="size-4" />{copy.back}</button>
      <p className="text-sm font-semibold text-emerald-700">{copy.step} {step} {copy.ofThree}</p>
    </div>
    {step === 1 ? <>
      <div><h2 className="text-xl font-semibold">{copy.object}</h2><p className="mt-1 text-sm text-zinc-600">{copy.objectHint}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{objectTypeIcons.map((object) => { const ObjectIcon = object.icon; return <button
        aria-pressed={parameters.objectType === object.value}
        className={`flex min-h-16 items-center gap-3 rounded-md border p-3 text-left text-sm font-semibold transition-colors ${parameters.objectType === object.value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white hover:border-zinc-400"}`}
        key={object.value} onClick={() => patch("objectType", object.value)} type="button"
      ><ObjectIcon aria-hidden="true" className="size-5 shrink-0" />{objectTypeLabel(object.value, copy)}</button>; })}</div>
      <button className={actionClassName.primary} onClick={() => setStep(2)} type="button">{copy.continue}<ChevronRight className="size-4" /></button>
    </> : <div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
      <header className="border-b border-zinc-200 px-4 py-4 sm:px-5">
        <h2 className="text-xl font-semibold">{copy.cctvParameters}</h2>
        <p className="mt-1 text-sm text-zinc-600">{copy.cctvParametersHint}</p>
      </header>

      <div className="divide-y divide-zinc-200">
        <ParameterRow icon={Camera} subtitle={copy.indoorHint} title={copy.indoorCameras}
          primary={<Control label={copy.quantityPcs}><Counter copy={copy} hideLabel label={copy.indoorCameras} max={128} onChange={(value) => patch("indoorCameraCount", value)} value={parameters.indoorCameraCount} /></Control>}
          secondary={<ResolutionSelect copy={copy} label={copy.resolutionMp} onChange={(value) => patch("indoorResolutionMp", value)} value={parameters.indoorResolutionMp} />}
        />
        <ParameterRow icon={Cctv} subtitle={copy.outdoorHint} title={copy.outdoorCameras}
          primary={<Control label={copy.quantityPcs}><Counter copy={copy} hideLabel label={copy.outdoorCameras} max={128} onChange={(value) => patch("outdoorCameraCount", value)} value={parameters.outdoorCameraCount} /></Control>}
          secondary={<ResolutionSelect copy={copy} label={copy.resolutionMp} onChange={(value) => patch("outdoorResolutionMp", value)} value={parameters.outdoorResolutionMp} />}
        />
        <ParameterRow icon={Server} subtitle={copy.recorderHint} title={copy.recorder}
          primary={<Control label={copy.quantityPcs}><output aria-label={copy.recorderCount} className="flex min-h-11 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700">{parameters.recorderSelection === "none" ? 0 : 1}</output></Control>}
          secondary={<Control label={copy.channelCount}><select aria-label={copy.recorderChannelCount} className={controlClassName} onChange={(event) => patch("recorderSelection", parseRecorderSelection(event.target.value))} value={String(parameters.recorderSelection)}><option value="auto">{copy.automatic}</option><option value="none">{copy.notNeeded}</option>{CCTV_RECORDER_CHANNELS.map((channels) => <option key={channels} value={channels}>{channels}</option>)}</select></Control>}
        />
        <ParameterRow icon={HardDrive} subtitle={copy.archiveHint} title={copy.archiveStorage}
          primary={<Control label={copy.archiveDays}><select aria-label={copy.archiveDays} className={controlClassName} onChange={(event) => patch("archiveDays", Number(event.target.value))} value={parameters.archiveDays}>{[7,14,30,60,90].map((days) => <option key={days} value={days}>{days} {copy.days}</option>)}</select></Control>}
        />
        <ParameterRow icon={Cable} subtitle={copy.cableHint} title={copy.cable}
          primary={<Control label={copy.cableLength}><input aria-label={copy.cableApproximate} className={controlClassName} max={20000} min={0} onChange={(event) => patch("cableLength", Math.max(0, Math.round(Number(event.target.value))))} type="number" value={parameters.cableLength} /></Control>}
        />
      </div>

      <section className="border-t border-emerald-100 bg-emerald-50/70 px-4 py-4 sm:px-5" aria-labelledby="quick-calculation-options">
        <h3 className="text-sm font-semibold text-emerald-950" id="quick-calculation-options">{copy.additionalOptions}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Toggle checked={parameters.installationRequested} label={copy.installationRequired} onChange={(value) => patch("installationRequested", value)} />
          <Toggle checked={parameters.commissioningRequested} label={copy.commissioningRequired} onChange={(value) => patch("commissioningRequested", value)} />
          <Toggle checked={parameters.remoteViewingRequested} label={copy.remoteViewing} onChange={(value) => patch("remoteViewingRequested", value)} />
        </div>
      </section>

      <div className="border-t border-zinc-200 px-4 py-4 sm:px-5">
        <details className="rounded-md border border-zinc-200 bg-white" onToggle={(event) => setAdvanced(event.currentTarget.open)} open={advanced}>
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">{copy.additionalParameters}</summary>
          <div className="grid gap-2 border-t border-zinc-200 p-4 sm:grid-cols-2">
            <Toggle checked={parameters.colorNight} label={copy.colorNight} onChange={(value) => patch("colorNight", value)} />
            <Toggle checked={parameters.licensePlateRecognition} label={copy.plateRecognition} onChange={(value) => patch("licensePlateRecognition", value)} />
            <Toggle checked={parameters.videoAnalytics} label={copy.videoAnalytics} onChange={(value) => patch("videoAnalytics", value)} />
            <Toggle checked={parameters.backupPower} label={copy.backupPower} onChange={(value) => patch("backupPower", value)} />
          </div>
        </details>
        {message && <div className="mt-4"><ActionFeedback kind="error" message={message} /></div>}
        <button className={`${actionClassName.primary} mt-4`} disabled={pending || parameters.indoorCameraCount + parameters.outdoorCameraCount === 0} onClick={calculate} type="button">{pending ? copy.calculating : copy.showResult}<ChevronRight className="size-4" /></button>
      </div>
    </div>}
  </section>;
}

const controlClassName = "min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm";

function ParameterRow({ icon: Icon, title, subtitle, primary, secondary }: {
  icon: LucideIcon; title: string; subtitle: string; primary: ReactNode; secondary?: ReactNode;
}) {
  return <div className="grid min-w-0 gap-4 px-4 py-4 md:grid-cols-2 md:items-end sm:px-5 lg:grid-cols-[minmax(16rem,1.15fr)_minmax(11rem,0.85fr)_minmax(11rem,0.85fr)] lg:items-center">
    <div className="flex min-w-0 items-center gap-3 md:col-span-2 lg:col-span-1">
      <span className="grid size-13 shrink-0 place-items-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700"><Icon aria-hidden="true" className="size-6" /></span>
      <span className="min-w-0"><strong className="block text-sm font-semibold text-zinc-950">{title}</strong><span className="mt-0.5 block text-sm text-zinc-500">{subtitle}</span></span>
    </div>
    <div className={secondary ? "min-w-0" : "min-w-0 md:col-span-2 lg:col-span-2"}>{primary}</div>
    {secondary && <div className="min-w-0">{secondary}</div>}
  </div>;
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return <div><span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>{children}</div>;
}

function ResolutionSelect({ label, value, onChange, copy }: { label: string; value: CctvCameraResolution; onChange: (value: CctvCameraResolution) => void; copy: ProposalGeneratorCopy }) {
  return <Control label={label}><select aria-label={label} className={controlClassName} onChange={(event) => onChange(Number(event.target.value) as CctvCameraResolution)} value={value}>{CCTV_CAMERA_RESOLUTIONS.map((mp) => <option key={mp} value={mp}>{mp} {copy.megapixels}</option>)}</select></Control>;
}

function Counter({ label, value, max, onChange, copy, hideLabel = false }: { label: string; value: number; max: number; onChange: (value: number) => void; copy: ProposalGeneratorCopy; hideLabel?: boolean }) {
  return <div><span className={hideLabel ? "sr-only" : "text-sm font-medium text-zinc-700"}>{label}</span><div className={`${hideLabel ? "" : "mt-1 "}grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-md border border-zinc-300`}>
    <button aria-label={`${copy.decrease}: ${label}`} className="grid min-h-11 place-items-center border-r border-zinc-300" disabled={value <= 0} onClick={() => onChange(value - 1)} type="button"><Minus className="size-4" /></button>
    <input aria-label={label} className="min-w-0 text-center text-sm font-semibold outline-none" max={max} min={0} onChange={(event) => onChange(Math.max(0, Math.min(max, Math.round(Number(event.target.value)))))} type="number" value={value} />
    <button aria-label={`${copy.increase}: ${label}`} className="grid min-h-11 place-items-center border-l border-zinc-300" disabled={value >= max} onClick={() => onChange(value + 1)} type="button"><Plus className="size-4" /></button>
  </div></div>;
}

function objectTypeLabel(value: CctvObjectType, copy: ProposalGeneratorCopy): string {
  return copy[value];
}

function parseRecorderSelection(value: string): CctvRecorderSelection {
  return value === "auto" || value === "none" ? value : Number(value) as CctvRecorderSelection;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? "border-emerald-200 bg-white text-emerald-950" : "border-zinc-200 bg-white text-zinc-700"}`}><input checked={checked} className="size-4 shrink-0 accent-emerald-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>;
}
