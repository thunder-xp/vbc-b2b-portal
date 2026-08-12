"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, Video } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { ActionFeedback, actionClassName, FormField } from "../../platform-ui";
import { calculateQuickProposalAction } from "../actions/proposal-generator.actions";
import {
  CCTV_CAMERA_RESOLUTIONS, CCTV_RECORDER_CHANNELS, type CctvCalculatorInput,
  type CctvCameraResolution, type CctvConfigurationSummary, type CctvObjectType, type CctvRecorderSelection,
} from "../services/proposal-generator-calculator";
import type { GeneratorRequirement } from "../services/proposal-generator";

const objectTypes: Array<{ value: CctvObjectType; label: string }> = [
  { value: "apartment", label: "Квартира" }, { value: "house", label: "Частный дом" },
  { value: "office", label: "Офис" }, { value: "retail", label: "Магазин / Retail" },
  { value: "warehouse", label: "Склад" }, { value: "industrial", label: "Промышленный объект" },
  { value: "horeca", label: "HoReCa" }, { value: "other", label: "Другое" },
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
    setMessage(result.message);
    if (result.success) onCalculated(result.data);
  });

  return <section className="space-y-5 border-y border-zinc-200 bg-white px-4 py-5 sm:px-6">
    <div className="flex items-center justify-between gap-3">
      <button className={actionClassName.secondary} onClick={step === 1 ? onBack : () => setStep(1)} type="button"><ChevronLeft className="size-4" />Назад</button>
      <p className="text-sm font-semibold text-emerald-700">Шаг {step} из 3</p>
    </div>
    {step === 1 ? <>
      <div><h2 className="text-xl font-semibold">Объект</h2><p className="mt-1 text-sm text-zinc-600">Выберите тип объекта. Это задаёт только полезные начальные значения.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{objectTypes.map((object) => <button
        aria-pressed={parameters.objectType === object.value}
        className={`min-h-16 rounded-md border p-3 text-left text-sm font-semibold transition-colors ${parameters.objectType === object.value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white hover:border-zinc-400"}`}
        key={object.value} onClick={() => patch("objectType", object.value)} type="button"
      ><Video aria-hidden="true" className="mb-2 size-4" />{object.label}</button>)}</div>
      <button className={actionClassName.primary} onClick={() => setStep(2)} type="button">Продолжить<ChevronRight className="size-4" /></button>
    </> : <>
      <div><h2 className="text-xl font-semibold">Параметры видеонаблюдения</h2><p className="mt-1 text-sm text-zinc-600">Укажите ориентировочный объём. Точные модели можно проверить на следующем шаге.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <CameraCounter label="Камеры внутри" max={128} onChange={(value) => patch("indoorCameraCount", value)} onResolutionChange={(value) => patch("indoorResolutionMp", value)} resolution={parameters.indoorResolutionMp} value={parameters.indoorCameraCount} />
        <CameraCounter label="Камеры снаружи" max={128} onChange={(value) => patch("outdoorCameraCount", value)} onResolutionChange={(value) => patch("outdoorResolutionMp", value)} resolution={parameters.outdoorResolutionMp} value={parameters.outdoorCameraCount} />
        <FormField label="Регистратор">{(props) => <select {...props} className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" onChange={(event) => patch("recorderSelection", parseRecorderSelection(event.target.value))} value={String(parameters.recorderSelection)}><option value="auto">Автоматически</option><option value="none">Не нужен</option>{CCTV_RECORDER_CHANNELS.map((channels) => <option key={channels} value={channels}>{channels} каналов</option>)}</select>}</FormField>
        <FormField label="Архив, дней">{(props) => <select {...props} className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm" onChange={(event) => patch("archiveDays", Number(event.target.value))} value={parameters.archiveDays}>{[7,14,30,60,90].map((days) => <option key={days} value={days}>{days}</option>)}</select>}</FormField>
        <FormField label="Кабель, ориентировочно, м">{(props) => <input {...props} className="min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm" max={20000} min={0} onChange={(event) => patch("cableLength", Math.max(0, Math.round(Number(event.target.value))))} type="number" value={parameters.cableLength} />}</FormField>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Toggle checked={parameters.installationRequested} label="Нужен монтаж" onChange={(value) => patch("installationRequested", value)} />
        <Toggle checked={parameters.commissioningRequested} label="Нужна настройка / пусконаладка" onChange={(value) => patch("commissioningRequested", value)} />
        <Toggle checked={parameters.remoteViewingRequested} label="Удалённый просмотр" onChange={(value) => patch("remoteViewingRequested", value)} />
      </div>
      <details className="rounded-md border border-zinc-200" onToggle={(event) => setAdvanced(event.currentTarget.open)} open={advanced}>
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Дополнительные параметры</summary>
        <div className="grid gap-2 border-t border-zinc-200 p-4 sm:grid-cols-2">
          <Toggle checked={parameters.colorNight} label="Цветное изображение ночью" onChange={(value) => patch("colorNight", value)} />
          <Toggle checked={parameters.licensePlateRecognition} label="Распознавание номеров" onChange={(value) => patch("licensePlateRecognition", value)} />
          <Toggle checked={parameters.videoAnalytics} label="Видеоаналитика" onChange={(value) => patch("videoAnalytics", value)} />
          <Toggle checked={parameters.backupPower} label="Резервное питание" onChange={(value) => patch("backupPower", value)} />
        </div>
      </details>
      {message && <ActionFeedback kind="error" message={message} />}
      <button className={actionClassName.primary} disabled={pending || parameters.indoorCameraCount + parameters.outdoorCameraCount === 0} onClick={calculate} type="button">{pending ? "Расчёт..." : "Показать результат"}<ChevronRight className="size-4" /></button>
    </>}
  </section>;
}

function Counter({ label, value, max, onChange, hideLabel = false }: { label: string; value: number; max: number; onChange: (value: number) => void; hideLabel?: boolean }) {
  return <div><span className={hideLabel ? "sr-only" : "text-sm font-medium text-zinc-700"}>{label}</span><div className={`${hideLabel ? "" : "mt-1 "}grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-md border border-zinc-300`}>
    <button aria-label={`Уменьшить: ${label}`} className="grid min-h-11 place-items-center border-r border-zinc-300" disabled={value <= 0} onClick={() => onChange(value - 1)} type="button"><Minus className="size-4" /></button>
    <input aria-label={label} className="min-w-0 text-center text-sm font-semibold outline-none" max={max} min={0} onChange={(event) => onChange(Math.max(0, Math.min(max, Math.round(Number(event.target.value)))))} type="number" value={value} />
    <button aria-label={`Увеличить: ${label}`} className="grid min-h-11 place-items-center border-l border-zinc-300" disabled={value >= max} onClick={() => onChange(value + 1)} type="button"><Plus className="size-4" /></button>
  </div></div>;
}

function CameraCounter({ label, value, resolution, max, onChange, onResolutionChange }: {
  label: string; value: number; resolution: CctvCameraResolution; max: number;
  onChange: (value: number) => void; onResolutionChange: (value: CctvCameraResolution) => void;
}) {
  return <div><span className="text-sm font-medium text-zinc-700">{label}</span><div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-2">
    <Counter hideLabel label={label} max={max} onChange={onChange} value={value} />
    <select aria-label={`Разрешение: ${label}`} className="min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm font-medium" onChange={(event) => onResolutionChange(Number(event.target.value) as CctvCameraResolution)} value={resolution}>{CCTV_CAMERA_RESOLUTIONS.map((mp) => <option key={mp} value={mp}>{mp} Мп</option>)}</select>
  </div></div>;
}

function parseRecorderSelection(value: string): CctvRecorderSelection {
  return value === "auto" || value === "none" ? value : Number(value) as CctvRecorderSelection;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-zinc-200 px-3 text-sm"><input checked={checked} className="size-4 accent-emerald-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>;
}
