"use client";

import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ProductLineThumbnail } from "../../catalog/components/ProductLineThumbnail";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import {
  getEstimatesCopy,
  formatPartnerDate,
  formatPartnerDateTime,
  formatPartnerMoney,
  partnerText,
  usePartnerLocale,
  type EstimatesCopy,
  type PartnerLocale,
} from "../../partner-locale";
import {
  checkEstimateCommercialStateAction,
  archiveEstimateAction,
  removeEstimateLineAction,
  saveEstimateCommercialAction,
} from "../actions/estimate.actions";
import {
  calculateEstimateCommercials,
  EstimateCalculationError,
  resolveCurrencyRate,
} from "../services/commercial-calculation";
import type {
  EstimateCommercialCheckDto,
  EstimateCommercialOptionsDto,
  EstimateDetailDto,
  EstimateServiceDto,
  SaveEstimateCommercialCommand,
} from "../services";
import {
  buildCanonicalEstimateSectionPresentation,
  resolveCanonicalSectionKey,
  type EstimateSectionPresentation,
} from "../services/estimate-sections";
import type {
  EstimateChargeType,
  EstimateCurrencyChangePolicy,
  EstimateSectionSystemKey,
  EstimateUnit,
  EstimateVatMode,
  EstimateWorkflowDto,
} from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import {
  EstimateLinePicker,
  type EstimateLinePickerMode,
} from "./EstimateLinePicker";
import { EstimateProposalSidebar } from "./EstimateProposalSidebar";
import { FinalCustomerPicker } from "./FinalCustomerPicker";
import { duplicateEstimateAction } from "../actions/lifecycle.actions";

const inputClass =
  "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:bg-zinc-100";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";
const units: EstimateUnit[] = ["pcs", "hour", "meter", "set", "visit", "service"];
const chargeTypes: EstimateChargeType[] = ["delivery", "installation", "commissioning", "transport", "other"];

type Draft = Pick<
  EstimateDetailDto,
  | "name"
  | "customerName"
  | "projectName"
  | "validityDays"
  | "currencyCode"
  | "vatMode"
  | "vatRatePercent"
  | "globalDiscountPercent"
  | "lines"
  | "charges"
> & {
  finalCustomerId: string | null;
  sections: Array<
    Pick<
      EstimateDetailDto["sections"][number],
      | "id"
      | "name"
      | "systemKey"
      | "sortOrder"
      | "showSubtotal"
      | "discountPercent"
    >
  >;
};

type PresentationSection = EstimateSectionPresentation<Draft["lines"][number]>;

export function EstimateCommercialEditor({
  initialEstimate,
  services,
  commercialOptions,
  workflow,
}: {
  initialEstimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  commercialOptions: EstimateCommercialOptionsDto;
  workflow: EstimateWorkflowDto;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const router = useRouter();
  const [estimate, setEstimate] = useState(initialEstimate);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialEstimate));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [currencyChangePolicy, setCurrencyChangePolicy] =
    useState<EstimateCurrencyChangePolicy>("preserve_manual");
  const [pending, startTransition] = useTransition();
  const [checking, startCheck] = useTransition();
  const [commercialCheck, setCommercialCheck] =
    useState<EstimateCommercialCheckDto | null>(null);
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [pickerMode, setPickerMode] = useState<EstimateLinePickerMode | null>(
    null,
  );
  const [targetSectionId, setTargetSectionId] = useState(
    () => canonicalTargetSectionId(initialEstimate.sections, "equipment") ?? "",
  );
  const isDraft = estimate.status === "draft";
  const retailOnly = estimate.commercialMode === "retail_only";

  const preview = useMemo(() => {
    try {
      return {
        value: calculateEstimateCommercials({
          lines: draft.lines.map((line) => ({
            id: line.id,
            sectionId: line.sectionId,
            quantity: line.quantity,
            pricingMode: line.pricingMode,
            pricingInputValue: line.pricingInputValue,
            convertedCostUnitPrice: line.convertedCostUnitPrice ?? null,
            lineDiscountPercent: line.lineDiscountPercent,
          })),
          sections: draft.sections,
          charges: draft.charges,
          globalDiscountPercent: draft.globalDiscountPercent,
          vatMode: draft.vatMode,
          vatRatePercent: draft.vatRatePercent,
        }),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof EstimateCalculationError
            ? error.message
            : copy.loadError,
      };
    }
  }, [copy.loadError, draft]);
  const draftReadiness = useMemo(() => {
    const invalidQuantityCount = draft.lines.filter(
      (line) => !Number.isFinite(line.quantity) || line.quantity <= 0,
    ).length;
    const missingPriceCount = draft.lines.filter(
      (line) =>
        line.pricingInputValue === null ||
        !Number.isFinite(line.pricingInputValue),
    ).length;
    const checks = [
      {
        label: copy.readinessAddLine,
        passed: draft.lines.length > 0,
      },
      {
        label: invalidQuantityCount
          ? `${copy.invalidQuantities}: ${invalidQuantityCount}`
          : copy.quantitiesComplete,
        passed: invalidQuantityCount === 0,
      },
      {
        label: missingPriceCount
          ? `${copy.missingPrices}: ${missingPriceCount}`
          : copy.pricesComplete,
        passed: missingPriceCount === 0,
      },
      {
        label: copy.currencyDefined,
        passed: /^[A-Z]{3}$/.test(draft.currencyCode),
      },
      {
        label: preview.error ?? copy.totalCalculated,
        passed: preview.value !== null,
      },
    ];
    return { ready: checks.every((check) => check.passed), checks };
  }, [copy, draft.currencyCode, draft.lines, preview]);

  useEffect(() => {
    if (!dirty) return;
    const warning = copy.unsavedLeaveWarning;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    const preventLinkNavigation = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        new URL(href, window.location.href).origin !== window.location.origin
      )
        return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", preventLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", preventLinkNavigation, true);
    };
  }, [copy.unsavedLeaveWarning, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const guardLocaleChange = (event: Event) => {
      if (!window.confirm(partnerText(locale, "shell.unsavedChanges"))) {
        event.preventDefault();
      }
    };
    window.addEventListener("novotech:before-locale-change", guardLocaleChange);
    return () =>
      window.removeEventListener(
        "novotech:before-locale-change",
        guardLocaleChange,
      );
  }, [dirty, locale]);

  const update = (next: (current: Draft) => Draft) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  };
  const acceptServer = (next: EstimateDetailDto, nextMessage: string) => {
    setEstimate(next);
    setDraft(toDraft(next));
    setDirty(false);
    setMessage(nextMessage);
    setTargetSectionId((current) =>
      next.sections.some((section) => section.id === current)
        ? current
        : (canonicalTargetSectionId(next.sections, "equipment") ?? ""),
    );
  };
  const mutate = (
    operation: () => ReturnType<typeof saveEstimateCommercialAction>,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const result = await operation();
      if (result.success) {
        acceptServer(result.data, result.message);
        after?.();
      } else setMessage(result.message);
    });

  const save = () => {
    if (!preview.value) return setMessage(preview.error);
    const payload: SaveEstimateCommercialCommand = {
      expectedRevision: estimate.revision,
      name: draft.name,
      finalCustomerId: draft.finalCustomerId,
      customerName: draft.customerName,
      projectName: draft.projectName,
      validityDays: draft.validityDays,
      currencyCode: draft.currencyCode,
      currencyChangePolicy,
      vatMode: draft.vatMode,
      vatRatePercent: draft.vatMode === "none" ? 0 : 20,
      globalDiscountPercent: draft.globalDiscountPercent,
      sections: draft.sections.map((section, sortOrder) => ({
        ...section,
        sortOrder,
      })),
      lines: draft.lines.map((line, position) => ({
        id: line.id,
        sectionId: line.sectionId,
        position: position + 1,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        pricingMode: line.pricingMode,
        pricingInputValue: line.pricingInputValue,
        internalCostUnitPrice: line.internalCostUnitPrice ?? null,
        lineDiscountPercent: line.lineDiscountPercent,
      })),
      charges: draft.charges.map((charge, sortOrder) => ({
        ...charge,
        sortOrder,
      })),
    };
    mutate(() => saveEstimateCommercialAction(estimate.id, payload));
  };
  const checkCommercialState = () =>
    startCheck(async () => {
      recordBehaviorInteraction({
        eventName: "estimate_price_check_started",
        route: "/cabinet/estimates/detail",
        sourceSurface: "estimate_editor",
      });
      const result = await checkEstimateCommercialStateAction(estimate.id);
      setMessage(result.message);
      if (result.success) {
        setCommercialCheck(result.data);
        setCheckedLineIds(
          new Set(
            result.data.lines
              .filter((line) => line.priceChanged && line.currentPrice !== null)
              .map((line) => line.lineId),
          ),
        );
      }
    });
  const openPickerForSection = (
    sectionId: string,
    mode: EstimateLinePickerMode,
  ) => {
    setTargetSectionId(sectionId);
    setPickerMode(mode);
    requestAnimationFrame(() =>
      document
        .getElementById("estimate-line-picker")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
    );
  };
  const presentationSections = useMemo(
    () =>
      buildCanonicalEstimateSectionPresentation({
        sections: draft.sections,
        lines: draft.lines,
        calculatedLines: preview.value?.lines ?? [],
        sectionTotals: preview.value?.sectionTotals ?? [],
      }),
    [draft, preview.value],
  );

  return (
    <div
      className="min-w-0 space-y-5"
      data-testid="estimate-workspace"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (dirty && !pending && isDraft && preview.value) save();
        }
      }}
    >
      <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="text-xs font-semibold text-emerald-700"
                href="/cabinet/estimates"
                prefetch={false}
              >
                ← {copy.title}
              </Link>
              <strong className="text-xs uppercase text-zinc-500">
                {estimate.estimateNumber}
              </strong>
              <EstimateStatusBadge
                status={
                  estimate.status === "archived"
                    ? "archived"
                    : estimate.lifecycleStatus
                }
              />
              {dirty && (
                <span className="text-xs font-semibold text-amber-700">
                  {copy.unsaved}
                </span>
              )}
            </div>
            <h1
              className="mt-1 truncate text-xl font-semibold text-zinc-950"
              title={draft.name}
            >
              {draft.name || copy.unnamed}
            </h1>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
              <Meta
                label={copy.customer}
                value={draft.customerName ?? copy.notSelected}
              />
              <Meta
                label={copy.project}
                value={draft.projectName ?? copy.notSpecified}
              />
              <Meta
                label={copy.calculation}
                value={`${draft.currencyCode} · ${vatModeLabel(draft.vatMode, copy)}`}
              />
              <Meta
                label={copy.validity}
                value={`${draft.validityDays} ${copy.daysShort}`}
              />
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <details className="relative">
              <summary className={`${buttonClass} cursor-pointer list-none`}>
                <MoreHorizontal className="size-4" />
                {copy.actionsMenu}
              </summary>
              <div className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
                <button
                  className={`${buttonClass} justify-start border-0`}
                  disabled={!dirty || pending || !isDraft}
                  onClick={() => {
                    setDraft(toDraft(estimate));
                    setDirty(false);
                  }}
                  type="button"
                >
                  <RotateCcw className="size-4" />
                  {copy.undoChanges}
                </button>
                <button
                  className={`${buttonClass} justify-start border-0`}
                  disabled={checking || !isDraft || dirty}
                  onClick={checkCommercialState}
                  type="button"
                >
                  <RotateCcw
                    className={`size-4 ${checking ? "animate-spin" : ""}`}
                  />
                  {checking ? copy.checking : copy.checkPrices}
                </button>
                <button
                  className={`${buttonClass} justify-start border-0`}
                  disabled={pending || dirty}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await duplicateEstimateAction(estimate.id);
                      setMessage(result.message);
                      if (result.success)
                        router.push(
                          `/cabinet/estimates/${result.data.estimateId}`,
                        );
                    })
                  }
                  type="button"
                >
                  <Copy className="size-4" />
                  {copy.duplicate}
                </button>
                {isDraft ? (
                  <button
                    className={`${buttonClass} justify-start border-0 text-red-700`}
                    disabled={pending || dirty}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await archiveEstimateAction(
                          estimate.id,
                          estimate.revision,
                        );
                        setMessage(result.message);
                        if (result.success) router.push("/cabinet/estimates");
                      })
                    }
                    type="button"
                  >
                    <Archive className="size-4" />
                    {copy.archiveAction}
                  </button>
                ) : null}
              </div>
            </details>
            <button
              aria-keyshortcuts="Control+S Meta+S"
              aria-label={copy.save}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45"
              disabled={!dirty || pending || !isDraft || !preview.value}
              onClick={() => save()}
              type="button"
            >
              <Save className="size-4" />
              {pending ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      </header>
      {message && (
        <p
          aria-live="polite"
          className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}
      {preview.error && (
        <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {preview.error}
        </p>
      )}

      <details className="border-y border-zinc-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-800">
          <span>{copy.settings}</span>
          <span className="text-xs font-normal text-zinc-500">
            {copy.settingsHint}
          </span>
        </summary>
        <div className="grid min-w-0 gap-3 border-t border-zinc-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={copy.name}>
            <input
              className={`${inputClass} w-full`}
              disabled={!isDraft}
              maxLength={200}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              value={draft.name}
            />
          </Field>
          <div className="min-w-0 max-w-full sm:col-span-2">
            <FinalCustomerPicker
              disabled={!isDraft}
              initialName={draft.customerName}
              onChange={(customer) =>
                update((d) => ({
                  ...d,
                  finalCustomerId: customer?.id ?? null,
                  customerName: customer?.displayName ?? null,
                }))
              }
              value={draft.finalCustomerId}
            />
          </div>
          <Field label={copy.projectObject}>
            <input
              className={`${inputClass} w-full`}
              disabled={!isDraft}
              onChange={(e) =>
                update((d) => ({ ...d, projectName: e.target.value }))
              }
              value={draft.projectName ?? ""}
            />
          </Field>
          <Field label={copy.currency}>
            <select
              className={`${inputClass} w-full`}
              disabled={!isDraft || retailOnly}
              onChange={(e) =>
                e.target.value !== draft.currencyCode &&
                setCurrencyChoice(e.target.value)
              }
              value={draft.currencyCode}
            >
              {commercialOptions.currencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </Field>
          <Field label={copy.vat}>
            <select
              className={`${inputClass} w-full`}
              disabled={!isDraft}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  vatMode: e.target.value as EstimateVatMode,
                  vatRatePercent: e.target.value === "none" ? 0 : 20,
                }))
              }
              value={draft.vatMode === "none" ? "none" : draft.vatMode}
            >
              <option
                value={draft.vatMode === "included" ? "included" : "separate"}
              >
                {copy.vatApplies}
              </option>
              <option value="none">{copy.vatNotApplies}</option>
            </select>
          </Field>
          <Field label={copy.discount}>
            <NumberInput
              disabled={!isDraft}
              onValue={(value) =>
                update((d) => ({ ...d, globalDiscountPercent: value ?? 0 }))
              }
              value={draft.globalDiscountPercent}
            />
          </Field>
          <Field label={copy.validityDays}>
            <NumberInput
              disabled={!isDraft}
              onValue={(value) =>
                update((d) => ({ ...d, validityDays: value ?? 1 }))
              }
              value={draft.validityDays}
            />
          </Field>
          {commercialOptions.rateFreshness ? (
            <div className="text-xs text-zinc-500 sm:col-span-2 xl:col-span-4">
              <p>{commercialOptions.rateFreshness.label}</p>
              {commercialOptions.rateFreshness.staleNotice ? (
                <p className="mt-1 text-amber-800">
                  {copy.staleRateWarning}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-4">
          {commercialCheck ? (
            <section className="border-y border-zinc-200 bg-white p-4">
              <PriceCheckPanel
                copy={copy}
                checkedLineIds={checkedLineIds}
                check={commercialCheck}
                locale={locale}
                onApply={() => {
                  update((current) => ({
                    ...current,
                    lines: current.lines.map((line) => {
                      const comparison = commercialCheck.lines.find(
                        (item) => item.lineId === line.id,
                      );
                      return comparison &&
                        checkedLineIds.has(line.id) &&
                        comparison.currentPrice !== null
                        ? {
                            ...line,
                            pricingMode: "direct",
                            pricingInputValue: comparison.currentPrice,
                          }
                        : line;
                    }),
                  }));
                  setMessage(
                    `${copy.currentPricesApplied} (${checkedLineIds.size})`,
                  );
                  recordBehaviorInteraction({
                    eventName: "estimate_price_check_applied",
                    route: "/cabinet/estimates/detail",
                    sourceSurface: "estimate_editor",
                  });
                  setCommercialCheck(null);
                }}
                onKeep={() => {
                  setCommercialCheck(null);
                  setMessage(
                    copy.savedValuesKept,
                  );
                }}
                onSelection={setCheckedLineIds}
              />
            </section>
          ) : null}
          {presentationSections.map((section) => {
            const canonical = section.config;
            const localizedSectionName = sectionName(canonical.key, copy);
            const sectionLines = section.lines;
            const isCollapsed = collapsed.has(canonical.key);
            return (
              <section
                className="border-y border-zinc-200 bg-white"
                data-section-key={canonical.key}
                key={canonical.key}
              >
                <div className="flex min-h-14 items-center gap-2 border-b border-zinc-200 px-3 py-2">
                  <button
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? copy.expandSection : copy.collapseSection}: ${localizedSectionName}`}
                    className="inline-flex size-11 items-center justify-center"
                    onClick={() =>
                      setCollapsed((current) =>
                        toggleSet(current, canonical.key),
                      )
                    }
                    type="button"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-sm font-semibold text-zinc-950"
                      title={localizedSectionName}
                    >
                      {localizedSectionName}
                    </h3>
                  </div>
                  <strong className="shrink-0 text-sm">
                    {money(section.total, draft.currencyCode, locale)}
                  </strong>
                </div>
                {!isCollapsed && (
                  <div>
                    {sectionLines.length ? (
                      <div
                        className="hidden grid-cols-[3rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.25rem_4.75rem_5.5rem_2.75rem] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500 xl:grid"
                        data-testid="estimate-line-header"
                      >
                        <span>{copy.photo}</span>
                        <span>{copy.position}</span>
                        <span>{copy.quantity}</span>
                        <span>{copy.unit}</span>
                        <span>{copy.sellingPrice}</span>
                        <span>{copy.lineDiscount}</span>
                        <span>{copy.lineTotal}</span>
                        <span />
                      </div>
                    ) : null}
                    <div className="divide-y divide-zinc-100">
                      {sectionLines.length ? (
                        sectionLines.map((line) => {
                          const calculated = preview.value?.lines.find(
                            (item) => item.id === line.id,
                          );
                          return (
                            <div
                              className="p-3"
                              data-line-type={line.lineType}
                              data-testid="estimate-line-row"
                              key={line.id}
                            >
                              <div
                                className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 xl:grid-cols-[3rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.25rem_4.75rem_5.5rem_2.75rem]"
                                data-testid="estimate-line-grid"
                              >
                                <div className="flex size-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                                  {line.lineType === "product" ||
                                  line.lineType === "external" ? (
                                    <ProductLineThumbnail
                                      imageUrl={line.imageUrl ?? null}
                                      productName={line.description}
                                      size="compact"
                                    />
                                  ) : (
                                    <span
                                      aria-hidden="true"
                                      className="size-12"
                                    />
                                  )}
                                </div>
                                <Field
                                  label={copy.position}
                                  labelClassName="xl:sr-only"
                                >
                                  <input
                                    className={`${inputClass} w-full`}
                                    disabled={!isDraft}
                                    onChange={(e) =>
                                      updateLine(
                                        draft,
                                        setDraft,
                                        setDirty,
                                        line.id,
                                        { description: e.target.value },
                                      )
                                    }
                                    required={
                                      line.lineType === "custom" ||
                                      line.lineType === "external"
                                    }
                                    title={line.description}
                                    value={line.description}
                                  />
                                  <div className="mt-1 flex min-h-4 flex-wrap items-center gap-2">
                                    <span
                                      className={lineTypeTone(line.lineType)}
                                    >
                                      {lineTypeLabel(line.lineType, copy)}
                                    </span>
                                    {line.sku && (
                                      <span className="text-[10px] text-zinc-500">
                                        SKU {line.sku}
                                      </span>
                                    )}
                                  </div>
                                </Field>
                                <div className="col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-5 xl:contents">
                                  <Field
                                    label={copy.quantity}
                                    labelClassName="xl:sr-only"
                                  >
                                    <NumberInput
                                      disabled={!isDraft}
                                      onValue={(value) =>
                                        updateLine(
                                          draft,
                                          setDraft,
                                          setDirty,
                                          line.id,
                                          { quantity: value ?? 0 },
                                        )
                                      }
                                      value={line.quantity}
                                    />
                                  </Field>
                                  <Field
                                    label={copy.unit}
                                    labelClassName="xl:sr-only"
                                  >
                                    <select
                                      className={`${inputClass} w-full`}
                                      disabled={!isDraft}
                                      onChange={(e) =>
                                        updateLine(
                                          draft,
                                          setDraft,
                                          setDirty,
                                          line.id,
                                          {
                                            unit: e.target
                                              .value as EstimateUnit,
                                          },
                                        )
                                      }
                                      value={line.unit}
                                    >
                                      {units.map((unit) => (
                                        <option
                                          key={unit}
                                          value={unit}
                                        >
                                          {unitLabel(unit, locale)}
                                        </option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field
                                    label={
                                      line.pricingMode === "direct"
                                        ? copy.price
                                        : line.pricingMode === "markup"
                                          ? copy.markup
                                          : copy.margin
                                    }
                                    labelClassName="xl:sr-only"
                                  >
                                    <NumberInput
                                      disabled={!isDraft}
                                      nullable
                                      onValue={(value) =>
                                        updateLine(
                                          draft,
                                          setDraft,
                                          setDirty,
                                          line.id,
                                          { pricingInputValue: value },
                                        )
                                      }
                                      value={line.pricingInputValue}
                                    />
                                  </Field>
                                  <Field
                                    label={copy.lineDiscount}
                                    labelClassName="xl:sr-only"
                                  >
                                    <NumberInput
                                      disabled={!isDraft}
                                      onValue={(value) =>
                                        updateLine(
                                          draft,
                                          setDraft,
                                          setDirty,
                                          line.id,
                                          { lineDiscountPercent: value ?? 0 },
                                        )
                                      }
                                      value={line.lineDiscountPercent}
                                    />
                                  </Field>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-zinc-500 xl:sr-only">
                                      {copy.lineTotal}
                                    </p>
                                    <p
                                      className="mt-3 flex min-h-5 items-center truncate text-sm font-semibold xl:mt-0 xl:min-h-11"
                                      title={
                                        calculated?.lineTotal === null ||
                                        calculated?.lineTotal === undefined
                                          ? copy.pricePending
                                          : money(
                                              calculated.lineTotal,
                                              draft.currencyCode,
                                              locale,
                                            )
                                      }
                                    >
                                      {calculated?.lineTotal === null ||
                                      calculated?.lineTotal === undefined
                                        ? copy.pricePending
                                        : money(
                                            calculated.lineTotal,
                                            draft.currencyCode,
                                            locale,
                                          )}
                                    </p>
                                  </div>
                                </div>
                                <div className="col-span-2 flex min-h-11 items-center justify-end xl:col-span-1 xl:self-start">
                                  <button
                                    aria-label={copy.deleteLine}
                                    className="inline-flex size-11 items-center justify-center text-red-700"
                                    disabled={!isDraft || dirty}
                                    onClick={() =>
                                      mutate(() =>
                                        removeEstimateLineAction(
                                          estimate.id,
                                          line.id,
                                          estimate.revision,
                                        ),
                                      )
                                    }
                                    type="button"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="p-5 text-sm text-zinc-500">
                          {copy.emptySection}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-2">
                      <span className="text-xs text-zinc-500">
                        {copy.subtotal}{" "}
                        {localizedSectionName.toLocaleLowerCase()}:{" "}
                        <strong className="text-zinc-800">
                          {money(section.total, draft.currencyCode, locale)}
                        </strong>
                      </span>
                      {isDraft ? (
                        <button
                          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45"
                          disabled={dirty || !section.targetSectionId}
                          onClick={() =>
                            section.targetSectionId &&
                            openPickerForSection(
                              section.targetSectionId,
                              canonical.defaultMode,
                            )
                          }
                          type="button"
                        >
                          <Plus className="size-4" />
                          {sectionAddLabel(canonical.key, copy)}
                        </button>
                      ) : null}
                    </div>
                    {isDraft &&
                    section.targetSectionId &&
                    targetSectionId === section.targetSectionId &&
                    pickerMode ? (
                      <EstimateLinePicker
                        allowedModes={canonical.allowedModes}
                        contextLabel={localizedSectionName}
                        disabled={dirty}
                        estimate={estimate}
                        externalItemType={externalItemTypeForSection(
                          canonical.key,
                        )}
                        mode={pickerMode}
                        onModeChange={setPickerMode}
                        onResult={acceptServer}
                        services={services}
                        targetSectionId={section.targetSectionId}
                      />
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
          {isDraft || draft.charges.length ? (
            <details className="border-y border-zinc-200 bg-white">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                {copy.extraCharges}
              </summary>
              <Charges copy={copy} draft={draft} disabled={!isDraft} update={update} />
            </details>
          ) : null}
        </main>
        <aside className="min-w-0 border-y border-zinc-200 bg-white p-5 xl:sticky xl:top-24">
          <Summary
            copy={copy}
            currency={draft.currencyCode}
            locale={locale}
            preview={preview.value}
            sections={presentationSections}
            vatMode={draft.vatMode}
            vatRatePercent={draft.vatRatePercent}
          />
          <EstimateProposalSidebar
            disabled={dirty || pending}
            readiness={draftReadiness}
            revision={estimate.revision}
            workflow={workflow}
          />
        </aside>
      </div>
      {currencyChoice && (
        <CurrencyDialog
          affectedLines={draft.lines.length}
          current={draft.currencyCode}
          effectiveDate={commercialOptions.rateEffectiveDate}
          manualLines={
            draft.lines.filter(
              (line) =>
                line.lineType !== "product" && line.pricingMode === "direct",
            ).length
          }
          onCancel={() => setCurrencyChoice(null)}
          onConfirm={(policy) => {
            if (!commercialOptions.usdMdlRate)
              return setMessage(copy.noPublishedRate);
            resolveCurrencyRate(
              draft.currencyCode,
              currencyChoice,
              commercialOptions.usdMdlRate,
            );
            update((current) => ({ ...current, currencyCode: currencyChoice }));
            setCurrencyChangePolicy(policy);
            setCurrencyChoice(null);
          }}
          copy={copy}
          locale={locale}
          rate={commercialOptions.usdMdlRate}
          target={currencyChoice}
        />
      )}
    </div>
  );
}

function externalItemTypeForSection(
  key: EstimateSectionSystemKey,
): "equipment" | "material" | "service" {
  if (key === "equipment") return "equipment";
  if (key === "installation_materials") return "material";
  return "service";
}

function PriceCheckPanel({
  copy,
  check,
  checkedLineIds,
  locale,
  onSelection,
  onApply,
  onKeep,
}: {
  copy: EstimatesCopy;
  check: EstimateCommercialCheckDto;
  checkedLineIds: Set<string>;
  locale: PartnerLocale;
  onSelection: (ids: Set<string>) => void;
  onApply: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="mt-4 border-t border-zinc-200 pt-4">
      <p className="text-xs text-zinc-500">
        {copy.checkedAt} {formatPartnerDateTime(check.checkedAt, locale)}. {copy.stockNotCaptured}
      </p>
      <div className="mt-3 divide-y divide-zinc-100">
        {check.lines.map((line) => (
          <label
            className="grid min-h-16 gap-2 py-3 sm:grid-cols-[auto_minmax(10rem,1fr)_10rem_10rem] sm:items-center"
            key={line.lineId}
          >
            <input
              checked={checkedLineIds.has(line.lineId)}
              disabled={line.currentPrice === null}
              onChange={(event) => {
                const next = new Set(checkedLineIds);
                if (event.target.checked) next.add(line.lineId);
                else next.delete(line.lineId);
                onSelection(next);
              }}
              type="checkbox"
            />
            <span className="min-w-0">
              <strong className="block truncate text-sm">
                {line.description}
              </strong>
              <span className="text-xs text-zinc-500">
                {line.sku ? `SKU ${line.sku}` : copy.noSku}
              </span>
            </span>
            <span className="text-sm">
              <span className="block text-xs text-zinc-500">
                {copy.estimateToCurrentPrice}
              </span>
              {formatNullableMoney(line.oldPrice, line.currencyCode, locale, copy)} →{" "}
              {formatNullableMoney(line.currentPrice, line.currencyCode, locale, copy)}
            </span>
            <span className="text-sm">
              <span className="block text-xs text-zinc-500">{copy.now}</span>
              {line.currentStock}
              {line.currentArrival ? ` · ${line.currentArrival}` : ""}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className={buttonClass} onClick={onKeep} type="button">
          {copy.keepEstimateValues}
        </button>
        <button
          className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45"
          disabled={!checkedLineIds.size}
          onClick={onApply}
          type="button"
        >
          {copy.applySelectedPrices}
        </button>
      </div>
    </div>
  );
}

function Charges({
  copy,
  draft,
  disabled,
  update,
}: {
  copy: EstimatesCopy;
  draft: Draft;
  disabled: boolean;
  update: (next: (draft: Draft) => Draft) => void;
}) {
  return (
    <div className="border-t border-zinc-200 p-4">
      <div className="flex justify-end">
        <button
          className={buttonClass}
          disabled={disabled}
          onClick={() =>
            update((d) => ({
              ...d,
              charges: [
                ...d.charges,
                {
                  id: crypto.randomUUID(),
                  chargeType: "delivery",
                  description: copy.delivery,
                  amount: 0,
                  vatApplicable: true,
                  customerVisible: true,
                  sortOrder: d.charges.length,
                },
              ],
            }))
          }
          type="button"
        >
          <Plus className="size-4" />
          {copy.add}
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {draft.charges.map((charge) => (
          <div
            className="grid gap-2 sm:grid-cols-[10rem_minmax(10rem,1fr)_8rem_auto_auto]"
            key={charge.id}
          >
            <select
              className={inputClass}
              disabled={disabled}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  charges: d.charges.map((item) =>
                    item.id === charge.id
                      ? {
                          ...item,
                          chargeType: e.target.value as EstimateChargeType,
                        }
                      : item,
                  ),
                }))
              }
              value={charge.chargeType}
            >
              {chargeTypes.map((type) => (
                <option key={type} value={type}>
                  {chargeTypeLabel(type, copy)}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              disabled={disabled}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  charges: d.charges.map((item) =>
                    item.id === charge.id
                      ? { ...item, description: e.target.value }
                      : item,
                  ),
                }))
              }
              value={charge.description}
            />
            <NumberInput
              disabled={disabled}
              onValue={(value) =>
                update((d) => ({
                  ...d,
                  charges: d.charges.map((item) =>
                    item.id === charge.id
                      ? { ...item, amount: value ?? 0 }
                      : item,
                  ),
                }))
              }
              value={charge.amount}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                checked={charge.vatApplicable}
                disabled={disabled}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    charges: d.charges.map((item) =>
                      item.id === charge.id
                        ? { ...item, vatApplicable: e.target.checked }
                        : item,
                    ),
                  }))
                }
                type="checkbox"
              />
              {copy.vat}
            </label>
            <button
              aria-label={`${copy.remove}: ${copy.extraCharges}`}
              className={buttonClass}
              disabled={disabled}
              onClick={() =>
                update((d) => ({
                  ...d,
                  charges: d.charges.filter((item) => item.id !== charge.id),
                }))
              }
              type="button"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Summary({
  copy,
  currency,
  locale,
  preview,
  sections,
  vatMode,
  vatRatePercent,
}: {
  copy: ReturnType<typeof getEstimatesCopy>;
  currency: string;
  locale: PartnerLocale;
  preview: ReturnType<typeof calculateEstimateCommercials> | null;
  sections: PresentationSection[];
  vatMode: EstimateVatMode;
  vatRatePercent: number;
}) {
  const vatApplicable =
    (vatMode === "included" || vatMode === "separate") && vatRatePercent > 0;
  const totalDiscount =
    (preview?.lineDiscountTotal ?? 0) +
    (preview?.sectionDiscountTotal ?? 0) +
    (preview?.globalDiscountAmount ?? 0);
  return (
    <section aria-labelledby="estimate-summary-title">
      <h2 className="font-semibold text-zinc-950" id="estimate-summary-title">
        {copy.commercialCalculation}
      </h2>
      <div className="mt-4 space-y-2">
        {sections.map((section) => (
          <div
            className="flex justify-between gap-3 text-sm"
            key={section.config.key}
          >
            <span
              className="min-w-0 truncate text-zinc-500"
              title={sectionName(section.config.key, copy)}
            >
              {sectionName(section.config.key, copy)}
            </span>
            <span className="shrink-0">{money(section.total, currency, locale)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-zinc-200 pt-2 text-sm">
          <span className="text-zinc-500">{copy.totalDiscount}</span>
          <span>{money(totalDiscount, currency, locale)}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-zinc-500">{copy.totalWithoutVat}</span>
          <span>{money(preview?.totalExcludingVat ?? 0, currency, locale)}</span>
        </div>
        {vatApplicable ? (
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-zinc-500">{copy.vat}</span>
            <span>{money(preview?.vatAmount ?? 0, currency, locale)}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t pt-4">
        <p className="text-xs font-medium text-zinc-500">{copy.payable}</p>
        <p className="mt-1 text-2xl font-semibold">
          {money(preview?.finalTotal ?? 0, currency, locale)}
        </p>
        {preview?.incompletePricing && (
          <p className="mt-3 bg-amber-50 p-2 text-xs text-amber-900">
            {copy.incompletePricing}
          </p>
        )}
      </div>
    </section>
  );
}

function CurrencyDialog({
  copy,
  current,
  target,
  rate,
  effectiveDate,
  affectedLines,
  manualLines,
  locale,
  onCancel,
  onConfirm,
}: {
  copy: EstimatesCopy;
  current: string;
  target: string;
  rate: number | null;
  effectiveDate: string | null;
  affectedLines: number;
  manualLines: number;
  locale: PartnerLocale;
  onCancel: () => void;
  onConfirm: (policy: EstimateCurrencyChangePolicy) => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-md bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{copy.changeCurrency}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt>{copy.currency}</dt>
          <dd>
            {current} → {target}
          </dd>
          <dt>{copy.exchangeRate}</dt>
          <dd>{rate ?? copy.notSpecified}</dd>
          <dt>{copy.rateDate}</dt>
          <dd>{effectiveDate ? formatPartnerDate(effectiveDate, locale) : "—"}</dd>
          <dt>{copy.positions}</dt>
          <dd>{affectedLines}</dd>
          <dt>{copy.manualPrices}</dt>
          <dd>{manualLines}</dd>
        </dl>
        <p className="mt-4 text-sm text-zinc-600">
          {copy.currencyChangeAtomic}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className={buttonClass} onClick={onCancel} type="button">
            {copy.cancel}
          </button>
          <button
            className={buttonClass}
            disabled={!rate}
            onClick={() => onConfirm("preserve_manual")}
            type="button"
          >
            {copy.preserveManualPrices}
          </button>
          <button
            className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-45"
            disabled={!rate}
            onClick={() => onConfirm("convert_all")}
            type="button"
          >
            {copy.convertAll}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
  labelClassName = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <label className={`min-w-0 text-xs font-medium text-zinc-600 ${className}`}>
      <span className={`mb-1 block ${labelClassName}`}>{label}</span>
      {children}
    </label>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="max-w-56 truncate" title={`${label}: ${value}`}>
        <span className="text-zinc-400">{label}:</span> {value}
      </dd>
    </div>
  );
}
function NumberInput({
  value,
  onValue,
  disabled,
  nullable = false,
}: {
  value: number | null;
  onValue: (value: number | null) => void;
  disabled?: boolean;
  nullable?: boolean;
}) {
  const [editor, setEditor] = useState({
    sourceValue: value,
    inputValue: value === null ? "" : String(value),
  });
  if (editor.sourceValue !== value)
    setEditor({
      sourceValue: value,
      inputValue: value === null ? "" : String(value),
    });
  const commit = (inputValue: string) => {
    const next = inputValue === "" ? (nullable ? null : 0) : Number(inputValue);
    if (next !== value) onValue(next);
  };
  const edit = (nextInputValue: string) => {
    setEditor({ sourceValue: value, inputValue: nextInputValue });
    if (nextInputValue === "") return;
    const next = Number(nextInputValue);
    if (Number.isFinite(next) && next !== value) onValue(next);
  };
  return (
    <input
      className={`${inputClass} w-full`}
      disabled={disabled}
      min="0"
      onBlur={(event) => commit(event.currentTarget.value)}
      onChange={(event) => edit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setEditor({
            sourceValue: value,
            inputValue: value === null ? "" : String(value),
          });
          event.currentTarget.blur();
        }
      }}
      step="0.01"
      type="number"
      value={editor.inputValue}
    />
  );
}
function toDraft(estimate: EstimateDetailDto): Draft {
  const vatMode: EstimateVatMode =
    estimate.vatMode === "included"
      ? "included"
      : estimate.vatMode === "none"
        ? "none"
        : "separate";
  return {
    name: estimate.name,
    finalCustomerId: estimate.finalCustomerId ?? null,
    customerName: estimate.customerName,
    projectName: estimate.projectName,
    validityDays: estimate.validityDays,
    currencyCode: estimate.currencyCode,
    vatMode,
    vatRatePercent: vatMode === "none" ? 0 : 20,
    globalDiscountPercent: estimate.globalDiscountPercent,
    sections: estimate.sections.map(
      ({ id, name, systemKey, sortOrder, showSubtotal, discountPercent }) => ({
        id,
        name,
        systemKey: systemKey ?? null,
        sortOrder,
        showSubtotal,
        discountPercent,
      }),
    ),
    lines: estimate.lines.map((item) => ({ ...item })),
    charges: estimate.charges.map((item) => ({ ...item })),
  };
}
function updateLine(
  draft: Draft,
  setDraft: React.Dispatch<React.SetStateAction<Draft>>,
  setDirty: (value: boolean) => void,
  id: string,
  patch: Partial<Draft["lines"][number]>,
) {
  setDraft({
    ...draft,
    lines: draft.lines.map((line) =>
      line.id === id ? { ...line, ...patch } : line,
    ),
  });
  setDirty(true);
}
function toggleSet(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
function lineTypeLabel(
  value: EstimateDetailDto["lines"][number]["lineType"],
  copy: ReturnType<typeof getEstimatesCopy>,
) {
  return value === "product"
    ? copy.equipment
    : value === "service"
      ? copy.workService
      : value === "external"
        ? copy.externalLine
        : copy.manualLine;
}
function lineTypeTone(value: EstimateDetailDto["lines"][number]["lineType"]) {
  return `rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${value === "product" ? "bg-emerald-50 text-emerald-800" : value === "service" ? "bg-blue-50 text-blue-800" : "bg-amber-100 text-amber-900"}`;
}
function vatModeLabel(
  mode: EstimateVatMode,
  copy: ReturnType<typeof getEstimatesCopy>,
) {
  return mode === "included"
    ? copy.vatIncluded
    : mode === "separate"
      ? copy.vatSeparate
      : mode === "excluded"
        ? copy.withoutVat
        : copy.vatNotApplies;
}
function sectionName(
  key: EstimateSectionSystemKey,
  copy: ReturnType<typeof getEstimatesCopy>,
) {
  return key === "equipment"
    ? copy.equipment
    : key === "installation_materials"
      ? copy.installationMaterials
      : key === "installation_works"
        ? copy.installationWorks
        : copy.commissioningWorks;
}
function sectionAddLabel(
  key: EstimateSectionSystemKey,
  copy: ReturnType<typeof getEstimatesCopy>,
) {
  return key === "equipment"
    ? copy.addEquipment
    : key === "installation_materials"
      ? copy.addMaterials
      : copy.addWork;
}
function unitLabel(unit: EstimateUnit, locale: "ru" | "ro") {
  const labels: Record<EstimateUnit, [string, string]> = {
    pcs: ["шт.", "buc."],
    hour: ["час", "oră"],
    meter: ["метр", "metru"],
    set: ["комплект", "set"],
    visit: ["выезд", "deplasare"],
    service: ["услуга", "serviciu"],
  };
  return labels[unit][locale === "ro" ? 1 : 0];
}
function canonicalTargetSectionId(
  sections: Draft["sections"],
  key: PresentationSection["config"]["key"],
): string | null {
  return (
    sections.find((section) => resolveCanonicalSectionKey(section) === key)
      ?.id ?? null
  );
}
function money(value: number, currency: string, locale: PartnerLocale) {
  return formatPartnerMoney(value, currency, locale);
}
function formatNullableMoney(value: number | null, currency: string, locale: PartnerLocale, copy: EstimatesCopy) {
  return value === null ? copy.pricePending : money(value, currency, locale);
}
function chargeTypeLabel(type: EstimateChargeType, copy: EstimatesCopy): string {
  return ({ delivery: copy.delivery, installation: copy.installation, commissioning: copy.commissioning, transport: copy.transport, other: copy.other })[type];
}
