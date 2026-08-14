"use client";

import {
  Building2,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Factory,
  House,
  Minus,
  Plus,
  Shapes,
  Store,
  Utensils,
  Warehouse,
} from "lucide-react";
import { useState } from "react";

import { protectedObjectOptions } from "../presentation";
import type {
  PublicCctvCalculatorInput,
  PublicCctvObjectType,
  PublicCctvQualityLevel,
} from "../services/public-cctv-calculator.service";
import type { PublicCctvServiceOption } from "../../cctv-calculation";
import type { PublicRetailLocale } from "../types";

type Values = {
  objectType: PublicCctvObjectType;
  indoor: number;
  outdoor: number;
  quality: PublicCctvQualityLevel;
  archive: 7 | 14 | 30;
  cable: number;
  installCameras: boolean;
  layCable: boolean;
  commissioning: boolean;
  remote: boolean;
  aiScenario: boolean;
  backup: boolean;
};

const objectIcons = [
  Building2,
  House,
  BriefcaseBusiness,
  Store,
  Warehouse,
  Factory,
  Utensils,
  Shapes,
];

export function PublicCctvCalculator({
  initialInput,
  initialObject,
  locale,
  serviceOptions = [],
}: {
  initialInput?: PublicCctvCalculatorInput;
  initialObject?: string;
  locale: PublicRetailLocale;
  serviceOptions?: PublicCctvServiceOption[];
}) {
  const ru = locale === "ru";
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Values>({
    objectType:
      initialInput?.objectType ??
      (protectedObjectOptions.some((item) => item.key === initialObject)
        ? (initialObject as PublicCctvObjectType)
        : "house"),
    indoor: initialInput?.indoorCameraCount ?? 2,
    outdoor: initialInput?.outdoorCameraCount ?? 2,
    quality: initialInput?.quality ?? "recommended",
    archive: initialInput?.archiveDays ?? 14,
    cable: initialInput?.cableLength ?? 100,
    installCameras: initialInput?.cameraInstallationRequested ?? true,
    layCable: initialInput?.cableLayingRequested ?? true,
    commissioning: initialInput?.commissioningRequested ?? true,
    remote: initialInput?.remoteViewingRequested ?? true,
    aiScenario: initialInput?.aiScenarioProgrammingRequested ?? false,
    backup: initialInput?.backupPower ?? false,
  });
  const patch = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const totalCameras = values.indoor + values.outdoor;
  const canContinue = step !== 2 || totalCameras > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          CCTV · {ru ? "Предварительный расчёт" : "Calcul preliminar"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {ru
            ? "Подберём систему видеонаблюдения"
            : "Alegem sistemul de supraveghere video"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
          {ru
            ? "Ответьте на несколько простых вопросов. Регистратор, архив и питание камер система рассчитает автоматически."
            : "Răspundeți la câteva întrebări simple. Sistemul va calcula automat recorderul, arhiva și alimentarea camerelor."}
        </p>
      </header>

      <div
        aria-label={ru ? `Шаг ${step} из 3` : `Pasul ${step} din 3`}
        className="mt-8"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
          <span>{ru ? `Шаг ${step} из 3` : `Pasul ${step} din 3`}</span>
          <span>{Math.round((step * 100) / 3)}%</span>
        </div>
        <div className="mt-2 h-1.5 bg-zinc-200">
          <div
            className="h-full bg-emerald-700 transition-[width]"
            style={{ width: `${(step * 100) / 3}%` }}
          />
        </div>
      </div>

      <form action="/calculator/cctv/result" className="mt-8" method="get">
        <input name="lang" type="hidden" value={locale} />
        <input name="object" type="hidden" value={values.objectType} />
        <input name="indoor" type="hidden" value={values.indoor} />
        <input name="outdoor" type="hidden" value={values.outdoor} />
        <input name="quality" type="hidden" value={values.quality} />
        <input name="archive" type="hidden" value={values.archive} />
        <input name="cable" type="hidden" value={values.cable} />
        {values.installCameras ? (
          <input name="installCameras" type="hidden" value="1" />
        ) : null}
        {values.layCable ? (
          <input name="layCable" type="hidden" value="1" />
        ) : null}
        {values.commissioning ? (
          <input name="commissioning" type="hidden" value="1" />
        ) : null}
        {values.remote ? <input name="remote" type="hidden" value="1" /> : null}
        {values.aiScenario ? (
          <input name="aiScenario" type="hidden" value="1" />
        ) : null}
        {values.backup ? <input name="backup" type="hidden" value="1" /> : null}

        <section
          aria-labelledby={`calculator-step-${step}`}
          className="min-h-[430px] border border-zinc-200 bg-white p-5 sm:p-8"
        >
          {step === 1 ? (
            <ObjectStep
              locale={locale}
              onChange={(value) => patch("objectType", value)}
              value={values.objectType}
            />
          ) : null}
          {step === 2 ? (
            <CameraStep locale={locale} patch={patch} values={values} />
          ) : null}
          {step === 3 ? (
            <InstallationStep
              locale={locale}
              patch={patch}
              serviceOptions={serviceOptions}
              values={values}
            />
          ) : null}
        </section>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 border border-zinc-300 px-5 text-sm font-semibold disabled:invisible"
            disabled={step === 1}
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft className="size-4" />
            {ru ? "Назад" : "Înapoi"}
          </button>
          {step < 3 ? (
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-emerald-700 px-6 text-sm font-semibold text-white disabled:bg-zinc-300"
              disabled={!canContinue}
              onClick={(event) => {
                event.preventDefault();
                setStep((current) => Math.min(3, current + 1));
              }}
              type="button"
            >
              {ru ? "Продолжить" : "Continuă"}
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-emerald-700 px-6 text-sm font-semibold text-white"
              type="submit"
            >
              {ru ? "Показать систему" : "Arată sistemul"}
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ObjectStep({
  locale,
  onChange,
  value,
}: {
  locale: PublicRetailLocale;
  onChange: (value: PublicCctvObjectType) => void;
  value: PublicCctvObjectType;
}) {
  const ru = locale === "ru";
  return (
    <fieldset>
      <legend className="text-2xl font-semibold" id="calculator-step-1">
        {ru ? "Что нужно защитить?" : "Ce doriți să protejați?"}
      </legend>
      <p className="mt-2 text-sm text-zinc-600">
        {ru
          ? "Тип объекта помогает оформить расчёт, но не подменяет технические параметры."
          : "Tipul obiectivului ajută la organizarea calculului, fără a înlocui parametrii tehnici."}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {protectedObjectOptions.map((item, index) => {
          const Icon = objectIcons[index];
          const active = value === item.key;
          return (
            <button
              aria-pressed={active}
              className={`min-h-28 border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? "border-emerald-700 bg-emerald-50" : "border-zinc-200 hover:border-zinc-400"}`}
              key={item.key}
              onClick={() => onChange(item.key as PublicCctvObjectType)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-6 text-emerald-700" />
              <span className="mt-4 block text-sm font-semibold">
                {ru ? item.ru : item.ro}
              </span>
              {active ? (
                <Check
                  aria-hidden="true"
                  className="ml-auto mt-2 size-4 text-emerald-700"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CameraStep({
  locale,
  patch,
  values,
}: {
  locale: PublicRetailLocale;
  patch: <K extends keyof Values>(key: K, value: Values[K]) => void;
  values: Values;
}) {
  const ru = locale === "ru";
  return (
    <div>
      <h2 className="text-2xl font-semibold" id="calculator-step-2">
        {ru ? "Сколько камер нужно?" : "Câte camere sunt necesare?"}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        {ru
          ? "Укажите камеры внутри и снаружи. Всего можно рассчитать до 32 камер."
          : "Indicați camerele pentru interior și exterior. Se pot calcula până la 32 de camere."}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Counter
          label={ru ? "Камеры внутри" : "Camere în interior"}
          locale={locale}
          max={32 - values.outdoor}
          onChange={(value) => patch("indoor", value)}
          value={values.indoor}
        />
        <Counter
          label={ru ? "Камеры снаружи" : "Camere în exterior"}
          locale={locale}
          max={32 - values.indoor}
          onChange={(value) => patch("outdoor", value)}
          value={values.outdoor}
        />
      </div>
      <fieldset className="mt-8">
        <legend className="text-base font-semibold">
          {ru ? "Качество изображения" : "Calitatea imaginii"}
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["standard", "recommended", "maximum"] as const).map((quality) => (
            <Choice
              key={quality}
              active={values.quality === quality}
              label={qualityLabel(quality, locale)}
              onClick={() => patch("quality", quality)}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-8">
        <legend className="text-base font-semibold">
          {ru
            ? "Сколько дней хранить запись?"
            : "Câte zile se păstrează înregistrarea?"}
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {([7, 14, 30] as const).map((days) => (
            <Choice
              key={days}
              active={values.archive === days}
              label={`${days} ${ru ? "дней" : "zile"}`}
              onClick={() => patch("archive", days)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function InstallationStep({
  locale,
  patch,
  serviceOptions,
  values,
}: {
  locale: PublicRetailLocale;
  patch: <K extends keyof Values>(key: K, value: Values[K]) => void;
  serviceOptions: PublicCctvServiceOption[];
  values: Values;
}) {
  const ru = locale === "ru";
  const keyByType = {
    camera_installation: "installCameras",
    cable_laying: "layCable",
    commissioning: "commissioning",
    remote_configuration: "remote",
    ai_scenario_programming: "aiScenario",
  } as const;
  const options = serviceOptions
    .filter(
      (item) =>
        item.objectType ===
        (values.objectType === "production" ? "industrial" : values.objectType),
    )
    .map((item) => ({
      key: keyByType[item.requestServiceType],
      label:
        item.requestServiceType === "ai_scenario_programming"
          ? ru
            ? "Программирование AI-сценариев"
            : "Programarea scenariilor AI"
          : ru
            ? item.labelRu
            : item.labelRo,
    }));
  return (
    <div>
      <h2 className="text-2xl font-semibold" id="calculator-step-3">
        {ru
          ? "Нужен монтаж и настройка?"
          : "Este necesară instalarea și configurarea?"}
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        {ru
          ? "Выберите нужные работы. В расчёт попадут только опубликованные общие тарифы."
          : "Selectați lucrările necesare. Calculul folosește numai tarifele comune publicate."}
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {options.map((item) => (
          <Toggle
            checked={values[item.key]}
            key={item.key}
            label={item.label}
            onChange={(checked) => patch(item.key, checked)}
          />
        ))}
      </div>
      <fieldset className="mt-8">
        <legend className="text-base font-semibold">
          {ru ? "Примерная длина кабеля" : "Lungimea aproximativă a cablului"}
        </legend>
        <p className="mt-2 text-sm text-zinc-500">
          {ru
            ? "Можно указать приблизительно — специалист уточнит длину на объекте."
            : "Puteți indica aproximativ — specialistul va confirma lungimea la obiectiv."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[50, 100, 200, 300].map((length) => (
            <Choice
              key={length}
              active={values.cable === length}
              label={
                length === 50
                  ? ru
                    ? "до 50 м"
                    : "până la 50 m"
                  : `${length} м`
              }
              onClick={() => patch("cable", length)}
            />
          ))}
        </div>
        <label className="mt-4 block max-w-xs text-sm font-medium">
          {ru ? "Другая длина, м" : "Altă lungime, m"}
          <input
            className="mt-2 min-h-12 w-full border border-zinc-300 px-3 text-base"
            max={20000}
            min={0}
            onChange={(event) =>
              patch(
                "cable",
                Math.max(0, Math.min(20000, Number(event.target.value) || 0)),
              )
            }
            type="number"
            value={values.cable}
          />
        </label>
      </fieldset>
      <details className="mt-7 border border-zinc-200 p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          {ru ? "Дополнительные возможности" : "Opțiuni suplimentare"}
        </summary>
        <div className="mt-3">
          <Toggle
            checked={values.backup}
            label={ru ? "Резервное питание" : "Alimentare de rezervă"}
            onChange={(checked) => patch("backup", checked)}
          />
        </div>
      </details>
    </div>
  );
}

function Counter({
  label,
  locale,
  max,
  onChange,
  value,
}: {
  label: string;
  locale: PublicRetailLocale;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const decrease = locale === "ro" ? "micșorează" : "уменьшить";
  const increase = locale === "ro" ? "mărește" : "увеличить";
  return (
    <div className="border border-zinc-200 p-4">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-4 grid grid-cols-[48px_1fr_48px] items-center">
        <button
          aria-label={`${label}: ${decrease}`}
          className="grid size-12 place-items-center border border-zinc-300 disabled:text-zinc-300"
          disabled={value === 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          type="button"
        >
          <Minus className="size-4" />
        </button>
        <output
          aria-live="polite"
          className="text-center text-2xl font-semibold tabular-nums"
        >
          {value}
        </output>
        <button
          aria-label={`${label}: ${increase}`}
          className="grid size-12 place-items-center border border-zinc-300 disabled:text-zinc-300"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
function Choice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-12 border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 border border-zinc-200 px-4 text-sm font-medium">
      <input
        checked={checked}
        className="size-5 accent-emerald-700"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
function qualityLabel(
  value: PublicCctvQualityLevel,
  locale: PublicRetailLocale,
) {
  const labels =
    locale === "ro"
      ? {
          standard: "Standard · 2 MP",
          recommended: "Recomandată · 6/4 MP",
          maximum: "Maximă · 8 MP",
        }
      : {
          standard: "Стандартное · 2 Мп",
          recommended: "Рекомендуемое · 6/4 Мп",
          maximum: "Максимальное · 8 Мп",
        };
  return labels[value];
}
