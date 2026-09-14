"use client";

import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ProductLineThumbnail } from "../../catalog/components/ProductLineThumbnail";
import { availabilityToneForStatus } from "../../catalog/components/ProductAvailabilityBlock";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import {
  getEstimatesCopy,
  getCatalogCopy,
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
import { deriveEstimateDraftReadiness } from "../services/draft-readiness";
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
  EstimateDraftReadinessDto,
  EstimateWorkflowDto,
} from "../types";
import { EstimateStatusBadge } from "./EstimateStatusBadge";
import {
  EstimateLinePicker,
  type EstimateLinePickerMode,
} from "./EstimateLinePicker";
import { EstimateWorkflowPanel } from "./EstimateWorkflowPanel";
import { EstimateQuickAdd } from "./EstimateQuickAdd";
import { estimateStockLabel } from "./estimate-stock-label";
import {
  canonicalEstimatePdfFileName,
  ESTIMATE_PDF_READY_EVENT,
  EstimatePdfShareAction,
  type EstimatePdfReadyDetail,
} from "./EstimatePdfShareAction";
import { FinalCustomerPicker } from "./FinalCustomerPicker";
import { duplicateEstimateAction, markEstimateReadyAction, saveEstimateAsTemplateAction } from "../actions/lifecycle.actions";
import { notifyEstimateDirtyState } from "./estimate-client-events";

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
  initialProposalAction,
}: {
  initialEstimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  commercialOptions: EstimateCommercialOptionsDto;
  workflow: EstimateWorkflowDto;
  initialProposalAction?: { kind: "resend"; versionId: string } | null;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const catalogCopy = getCatalogCopy(locale);
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
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [desktopActionsOpen, setDesktopActionsOpen] = useState(false);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [generatedSharePdf, setGeneratedSharePdf] =
    useState<EstimatePdfReadyDetail | null>(null);
  const mobileActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopActionsRef = useRef<HTMLDivElement>(null);
  const desktopActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const chargesRef = useRef<HTMLDetailsElement>(null);
  const [pickerMode, setPickerMode] = useState<EstimateLinePickerMode | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState(
    () => canonicalTargetSectionId(initialEstimate.sections, "equipment") ?? "",
  );
  const isDraft = estimate.status === "draft";
  const controlsDisabled = !isDraft || pending || inserting;
  const retailOnly = estimate.commercialMode === "retail_only";
  const latestProposal = workflow.versions[0] ?? null;

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
        errorTarget: null,
      };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof EstimateCalculationError
            ? error.message
            : copy.loadError,
        errorTarget: error instanceof EstimateCalculationError
          ? error.target?.kind === "line"
            ? { kind: "line" as const, lineId: error.target.lineId, field: "details" as const }
            : error.target?.kind === "charges"
              ? { kind: "charges" as const }
              : { kind: "settings" as const, field: "commercial" as const }
          : { kind: "settings" as const, field: "commercial" as const },
      };
    }
  }, [copy.loadError, draft]);
  const draftReadiness = useMemo(() => {
    const calculatedById = new Map(preview.value?.lines.map((line) => [line.id, line]) ?? []);
    return deriveEstimateDraftReadiness({
      applicable: isDraft && (estimate.lifecycleStatus ?? "draft") === "draft",
      dirty,
      estimateRevision: estimate.revision,
      canManage: workflow.permissions.canManage,
      lines: draft.lines.map((line) => ({
        id: line.id,
        position: line.position,
        quantity: line.quantity,
        sellingUnitPrice: calculatedById.get(line.id)?.sellingUnitPrice
          ?? (line.pricingInputValue !== null && Number.isFinite(line.pricingInputValue) ? line.pricingInputValue : null),
      })),
      currencyCode: draft.currencyCode,
      totalAmount: preview.value?.finalTotal ?? null,
      hasIncompletePricing: draft.lines.some((line) => line.pricingInputValue === null || !Number.isFinite(line.pricingInputValue)),
      calculationError: preview.error ? { target: preview.errorTarget } : null,
      latestProposal: latestProposal ? {
        estimateRevision: latestProposal.estimateRevision,
        status: latestProposal.status,
        pdfStatus: latestProposal.pdfStatus,
      } : null,
    });
  }, [dirty, draft.currencyCode, draft.lines, estimate.lifecycleStatus, estimate.revision, isDraft, latestProposal, preview, workflow.permissions.canManage]);

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
    notifyEstimateDirtyState({ estimateId: estimate.id, dirty });
  }, [dirty, estimate.id]);

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
    setSaveState("dirty");
    setMessage(null);
  };
  const acceptServer = (next: EstimateDetailDto, nextMessage: string) => {
    setEstimate(next);
    setDraft(toDraft(next));
    setDirty(false);
    setSaveState("saved");
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
    setSaveState("saving");
    startTransition(async () => {
      const result = await saveEstimateCommercialAction(estimate.id, payload);
      if (result.success) acceptServer(result.data, result.message);
      else {
        setMessage(result.message);
        setSaveState("error");
      }
    });
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
    setPickerMode(mode === "external" ? mode : null);
    requestAnimationFrame(() =>
      document
        .getElementById("estimate-quick-search")?.focus({ preventScroll: true }),
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
  const equipmentSectionId = canonicalTargetSectionId(
    draft.sections,
    "equipment",
  );
  const insertionSection = presentationSections.find(section => section.targetSectionId === targetSectionId);
  const insertionGroup = insertionSection?.config.defaultMode === "service" ? "works" : insertionSection?.config.key ?? "equipment";
  const runDraftPrimaryAction = (readiness: EstimateDraftReadinessDto) => {
    if (readiness.primaryAction === "save") return save();
    if (readiness.primaryAction === "add_product") {
      if (equipmentSectionId) openPickerForSection(equipmentSectionId, "product");
      return;
    }
    const target = readiness.target;
    if (target?.kind === "settings") {
      if (settingsRef.current) settingsRef.current.open = true;
      requestAnimationFrame(() => document.getElementById(
        target.field === "currency" ? "estimate-currency" : "estimate-global-discount",
      )?.focus());
      return;
    }
    if (target?.kind === "charges") {
      if (chargesRef.current) chargesRef.current.open = true;
      requestAnimationFrame(() => document.getElementById("estimate-charges")?.scrollIntoView?.({ behavior: "smooth", block: "center" }));
      return;
    }
    if (target?.kind === "line") {
      const section = presentationSections.find((item) => item.lines.some((line) => line.id === target.lineId));
      if (section) setCollapsed((current) => {
        const next = new Set(current);
        next.delete(section.config.key);
        return next;
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const lineDetails = document.getElementById(`estimate-line-${target.lineId}-details`) as HTMLDetailsElement | null;
        if (target.field === "details" && lineDetails) lineDetails.open = true;
        const control = document.getElementById(`estimate-line-${target.lineId}-${target.field}`)
          ?? lineDetails?.querySelector<HTMLElement>("input,select")
          ?? document.getElementById(`estimate-line-${target.lineId}`);
        control?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        control?.focus();
      }));
    }
  };
  useEffect(() => {
    const receiveReadyPdf = (event: Event) => {
      const detail = (event as CustomEvent<EstimatePdfReadyDetail>).detail;
      if (
        detail.estimateId === estimate.id &&
        detail.versionId === latestProposal?.id &&
        detail.estimateRevision === estimate.revision
      ) {
        setGeneratedSharePdf(detail);
      }
    };
    window.addEventListener(ESTIMATE_PDF_READY_EVENT, receiveReadyPdf);
    return () =>
      window.removeEventListener(ESTIMATE_PDF_READY_EVENT, receiveReadyPdf);
  }, [estimate.id, estimate.revision, latestProposal?.id]);
  const mobileShareDocumentId =
    !dirty && latestProposal?.estimateRevision === estimate.revision
      ? latestProposal.pdfStatus === "ready" && latestProposal.pdfDocumentId
        ? latestProposal.pdfDocumentId
        : generatedSharePdf?.versionId === latestProposal.id &&
            generatedSharePdf.estimateRevision === estimate.revision
          ? generatedSharePdf.id
          : null
      : null;
  const proposalPreviewHref = latestProposal
    ? `/cabinet/estimates/${workflow.estimateId}/versions/${latestProposal.id}/preview`
    : `/cabinet/estimates/${workflow.estimateId}/preview`;
  const closeMobileActions = useCallback(() => {
    setMobileActionsOpen(false);
    requestAnimationFrame(() => mobileActionsTriggerRef.current?.focus());
  }, [setMobileActionsOpen]);
  const closeActionMenus = useCallback(() => {
    setDesktopActionsOpen(false);
    setMobileActionsOpen(false);
    setTemplateFormOpen(false);
  }, [setDesktopActionsOpen, setMobileActionsOpen, setTemplateFormOpen]);

  useEffect(() => {
    if (!desktopActionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !desktopActionsRef.current?.contains(event.target)) setDesktopActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopActionsOpen(false);
        desktopActionsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [desktopActionsOpen]);

  useEffect(() => {
    if (!mobileActionsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileActions();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMobileActions, mobileActionsOpen]);

  const undoChanges = () => {
    setDraft(toDraft(estimate));
    setDirty(false);
    setSaveState("saved");
    closeActionMenus();
  };
  const duplicateEstimate = () => {
    closeActionMenus();
    startTransition(async () => {
      const result = await duplicateEstimateAction(estimate.id);
      setMessage(result.message);
      if (result.success) router.push(`/cabinet/estimates/${result.data.estimateId}`);
    });
  };
  const archiveEstimate = () => {
    closeActionMenus();
    startTransition(async () => {
      const result = await archiveEstimateAction(
        estimate.id,
        estimate.revision,
      );
      setMessage(result.message);
      if (result.success) router.push("/cabinet/estimates");
    });
  };
  const markReady = () => { closeActionMenus(); startTransition(async () => {
    const result = await markEstimateReadyAction(estimate.id, estimate.revision);
    setMessage(result.success ? copy.operationSucceeded : result.message);
    if (result.success) router.refresh();
  }); };
  const saveAsTemplate = () => startTransition(async () => {
    const result = await saveEstimateAsTemplateAction(estimate.id, templateName);
    setMessage(result.success ? copy.operationSucceeded : result.message);
    if (result.success) { setTemplateName(""); closeActionMenus(); }
  });
  const secondaryActions = (mobile = false) => (
    <>
      <button
        className={`${buttonClass} justify-start border-0 ${mobile ? "w-full" : ""}`}
        disabled={!dirty || controlsDisabled}
        onClick={undoChanges}
        type="button"
      >
        <RotateCcw className="size-4" />
        {copy.undoChanges}
      </button>
      <button
        className={`${buttonClass} justify-start border-0 ${mobile ? "w-full" : ""}`}
        disabled={checking || controlsDisabled || dirty}
        onClick={() => {
          closeActionMenus();
          checkCommercialState();
        }}
        type="button"
      >
        <RotateCcw className={`size-4 ${checking ? "animate-spin" : ""}`} />
        {checking ? copy.checking : copy.checkPrices}
      </button>
      {workflow.guidedState.secondaryActions.includes("mark_ready") ? (
        <button
          className={`${buttonClass} justify-start border-0 ${mobile ? "w-full" : ""}`}
          disabled={pending || dirty || !workflow.readiness.ready}
          onClick={markReady}
          type="button"
        >
          <CheckCircle2 className="size-4" />
          {copy.markReady}
        </button>
      ) : null}
      {workflow.guidedState.secondaryActions.includes("save_template") ? (
        <div className="min-w-0">
          <button
            aria-expanded={templateFormOpen}
            className={`${buttonClass} w-full justify-start border-0`}
            disabled={pending || dirty}
            onClick={() => setTemplateFormOpen((current) => !current)}
            type="button"
          >
            <Save className="size-4" />
            {copy.saveAsTemplate}
          </button>
          {templateFormOpen ? <div className="grid gap-2 border-t border-zinc-100 p-2">
            <label className="text-xs font-medium text-zinc-600">{copy.templateName}
              <input autoFocus className={`${inputClass} mt-1 w-full`} maxLength={120} onChange={(event) => setTemplateName(event.target.value)} value={templateName} />
            </label>
            <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-45" disabled={pending || !templateName.trim()} onClick={saveAsTemplate} type="button">{copy.save}</button>
          </div> : null}
        </div>
      ) : null}
      <button
        className={`${buttonClass} justify-start border-0 ${mobile ? "w-full" : ""}`}
        disabled={pending || inserting || dirty}
        onClick={duplicateEstimate}
        type="button"
      >
        <Copy className="size-4" />
        {copy.duplicate}
      </button>
      {isDraft ? (
        <button
          className={`${buttonClass} justify-start border-0 text-red-700 ${mobile ? "mt-2 w-full border-t border-zinc-200 pt-3" : ""}`}
          disabled={pending || inserting || dirty}
          onClick={archiveEstimate}
          type="button"
        >
          <Archive className="size-4" />
          {copy.archiveAction}
        </button>
      ) : null}
    </>
  );
  const saveLabel = saveState === "saving"
    ? copy.saving
    : saveState === "error"
      ? copy.saveError
    : !dirty && saveState === "saved"
      ? copy.saved
      : copy.save;

  return (
    <div
      className="min-w-0 space-y-4 pb-24 xl:space-y-5 xl:pb-0"
      data-testid="estimate-workspace"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (dirty && !controlsDisabled && preview.value) save();
        }
      }}
    >
      <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur lg:-mx-8 lg:px-8 xl:py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between xl:gap-3">
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
                locale={locale}
                status={
                  estimate.status === "archived"
                    ? "archived"
                    : estimate.lifecycleStatus
                }
              />
              <span role="status" className={`text-xs font-semibold ${dirty ? "text-amber-700" : "text-emerald-700"}`}>
                {dirty ? `● ${copy.unsaved}` : `✓ ${copy.saved}`}
              </span>
            </div>
            <h1
              className="mt-1 truncate text-xl font-semibold text-zinc-950"
              title={draft.name}
            >
              {draft.name || copy.unnamed}
            </h1>
            <dl className="mt-1 hidden flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 sm:flex">
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
          <div className="hidden flex-wrap items-center gap-2 xl:flex">
            <Link className={buttonClass} href={proposalPreviewHref} prefetch={false}><Eye className="size-4" />{copy.proposalPreview}</Link>
            <div className="relative" ref={desktopActionsRef}>
              <button aria-expanded={desktopActionsOpen} aria-haspopup="menu" className={buttonClass} data-testid="estimate-desktop-actions-trigger" onClick={() => setDesktopActionsOpen((current) => !current)} ref={desktopActionsTriggerRef} type="button">
                <MoreHorizontal className="size-4" />
                {copy.actionsMenu}
              </button>
              {desktopActionsOpen ? <div className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-md border border-zinc-200 bg-white p-2 shadow-lg" data-testid="estimate-desktop-actions-menu" role="menu">
                {secondaryActions()}
              </div> : null}
            </div>
            <button
              aria-keyshortcuts="Control+S Meta+S"
              aria-label={copy.save}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-45"
              disabled={!dirty || controlsDisabled || !preview.value}
              onClick={() => save()}
              type="button"
            >
              <Save className="size-4" />
              {saveLabel}
            </button>
          </div>
        </div>
        {isDraft && insertionSection && targetSectionId ? <div className="mt-2 min-w-0 space-y-2" data-testid="estimate-composition-lane">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div role="group" aria-label={locale === "ro" ? "Secțiunea destinație" : "Раздел добавления"} className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
              {([
                ["equipment", locale === "ro" ? "Echipamente" : "Оборудование", "equipment"],
                ["installation_materials", locale === "ro" ? "Materiale" : "Материалы", "installation_materials"],
                ["works", locale === "ro" ? "Lucrări" : "Работы", "installation_works"],
              ] as const).map(([group, label, key]) => <button type="button" key={group} disabled={controlsDisabled} aria-pressed={insertionGroup === group} className={`min-h-11 rounded px-2 text-xs font-semibold sm:px-3 ${insertionGroup === group ? "bg-white text-emerald-800 shadow-sm" : "text-zinc-600"}`} onClick={() => {
                const id = canonicalTargetSectionId(draft.sections, key); if (id) openPickerForSection(id, group === "works" ? "service" : "product");
              }}>{label}</button>)}
            </div>
            {insertionGroup === "works" ? <select aria-label={locale === "ro" ? "Tip de lucrări" : "Вид работ"} className={`${inputClass} max-w-full flex-1 sm:max-w-72`} disabled={controlsDisabled} value={targetSectionId} onChange={event => openPickerForSection(event.target.value, "service")}>
              {presentationSections.filter(section => section.config.defaultMode === "service" && section.targetSectionId).map(section => <option key={section.targetSectionId} value={section.targetSectionId!}>{section.customName ?? sectionName(section.config.key, copy)}</option>)}
            </select> : <span className="truncate text-xs text-zinc-500">{insertionSection.customName ?? sectionName(insertionSection.config.key, copy)}</span>}
          </div>
          <EstimateQuickAdd key={targetSectionId} estimate={estimate} services={services} sectionId={targetSectionId} serviceMode={insertionSection.config.defaultMode === "service"} serviceWorkSectionKey={insertionSection.config.key === "installation_works" || insertionSection.config.key === "commissioning_works" ? insertionSection.config.key : undefined} disabled={dirty || pending} onPendingChange={setInserting} onResult={acceptServer} onExternal={() => setPickerMode("external")} onBatch={() => setPickerMode(insertionSection.config.defaultMode)} />
        </div> : null}
      </header>
      {isDraft && insertionSection && pickerMode ? <section className="relative border border-zinc-200" aria-label={copy.add}>
        <button className="absolute right-2 top-2 z-10 inline-flex size-11 items-center justify-center bg-white" aria-label={copy.cancel} onClick={() => { setPickerMode(null); requestAnimationFrame(() => document.getElementById("estimate-quick-search")?.focus()); }} type="button"><X className="size-4" /></button>
        <EstimateLinePicker allowedModes={insertionSection.config.allowedModes} contextLabel={insertionSection.customName ?? sectionName(insertionSection.config.key, copy)} disabled={dirty || pending || inserting} estimate={estimate} externalItemType={externalItemTypeForSection(insertionSection.config.key)} mode={pickerMode} onModeChange={setPickerMode} onResult={acceptServer} services={services} targetSectionId={targetSectionId} targetSectionKey={insertionSection.config.key} />
      </section> : null}
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

      <details className="border-y border-zinc-200 bg-white" id="estimate-settings" ref={settingsRef}>
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
              disabled={controlsDisabled}
              maxLength={200}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
              value={draft.name}
            />
          </Field>
          <div className="min-w-0 max-w-full" data-testid="estimate-customer-field">
            <FinalCustomerPicker
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
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
              id="estimate-currency"
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
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
              inputId="estimate-global-discount"
              onValue={(value) =>
                update((d) => ({ ...d, globalDiscountPercent: value ?? 0 }))
              }
              value={draft.globalDiscountPercent}
            />
          </Field>
          <Field label={copy.validityDays}>
            <NumberInput
              disabled={controlsDisabled}
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
            const localizedSectionName = section.customName ?? sectionName(canonical.key, copy);
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
                    {editingSection === section.targetSectionId ? <input autoFocus disabled={controlsDisabled} aria-label={locale === "ro" ? "Denumirea secțiunii" : "Название раздела"} className={`${inputClass} w-full`} maxLength={120} value={draft.sections.find(item => item.id === section.targetSectionId)?.name ?? localizedSectionName} onFocus={event => event.currentTarget.select()} onChange={event => update(current => ({ ...current, sections: current.sections.map(item => item.id === section.targetSectionId ? { ...item, name: event.target.value } : item) }))} onBlur={() => setEditingSection(null)} onKeyDown={event => { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); setEditingSection(null); } }} /> : <h3
                      className="truncate text-sm font-semibold text-zinc-950"
                      title={localizedSectionName}
                    >
                      {localizedSectionName}
                    </h3>}
                    <span className="text-xs text-zinc-500">{copy.positions}: {sectionLines.length}</span>
                  </div>
                  {isDraft && section.targetSectionId ? <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center text-zinc-500" aria-label={`${locale === "ro" ? "Redenumește" : "Переименовать"}: ${localizedSectionName}`} title={locale === "ro" ? "Redenumește" : "Переименовать"} disabled={controlsDisabled} onClick={() => setEditingSection(section.targetSectionId)}><Pencil className="size-4" /></button> : null}
                  <strong className="shrink-0 text-sm">
                    {money(section.total, draft.currencyCode, locale)}
                  </strong>
                </div>
                {!isCollapsed && (
                  <div>
                    {sectionLines.length ? (
                      <div
                        className="hidden grid-cols-[3rem_minmax(0,1fr)_6rem_4.5rem_6.5rem_6rem_2.75rem] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500 xl:grid"
                        data-testid="estimate-line-header"
                      >
                        <span>{copy.photo}</span>
                        <span>{copy.position}</span>
                        <span>{locale === "ro" ? "Stoc" : "Наличие"}</span>
                        <span>{copy.quantity}</span>
                        <span>{copy.sellingPrice}</span>
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
                          const productName = line.productName ?? line.description;
                          const stockTone = availabilityToneForStatus(
                            line.productUnavailable ? "out_of_stock" : line.currentStockStatus ?? undefined,
                          );
                          return (
                            <div
                              className="px-3 py-2"
                              data-line-type={line.lineType}
                              data-testid="estimate-line-row"
                              id={`estimate-line-${line.id}`}
                              key={line.id}
                            >
                              <div
                                className="grid grid-cols-[3rem_minmax(0,1fr)_2.75rem] items-start gap-2 xl:grid-cols-[3rem_minmax(0,1fr)_6rem_4.5rem_6.5rem_6rem_2.75rem]"
                                data-testid="estimate-line-grid"
                              >
                                <div className="flex size-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                                  {line.lineType === "product" ||
                                  line.lineType === "external" ? (
                                    <ProductLineThumbnail
                                      imageUrl={line.imageUrl ?? null}
                                      productName={productName}
                                      size="compact"
                                    />
                                  ) : (
                                    <span
                                      aria-hidden="true"
                                      className="size-12"
                                    />
                                  )}
                                </div>
                                {line.lineType === "product" ? (
                                  <div className="min-w-0 py-1">
                                    {line.productSlug && !line.productUnavailable ? <Link className="block truncate text-sm font-semibold text-zinc-900 underline-offset-2 hover:text-emerald-800 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500" href={`/cabinet/catalog/${line.productSlug}`} rel="noopener noreferrer" target="_blank" title={productName}>{productName}</Link> : <p className="truncate text-sm font-semibold text-zinc-900" title={productName}>{productName}</p>}
                                    <div className="mt-1 flex min-h-4 flex-wrap items-center gap-2">
                                      <span className={lineTypeTone(line.lineType)}>{lineTypeLabel(line.lineType, copy)}</span>
                                      {line.sku ? <span className="text-[10px] text-zinc-500">SKU {line.sku}</span> : null}
                                    </div>
                                    {line.description && line.description !== productName ? <p className="mt-1 line-clamp-3 text-xs leading-4 text-zinc-600" title={line.description}>{line.description}</p> : null}
                                  </div>
                                ) : (
                                  <Field
                                    label={copy.position}
                                    labelClassName="xl:sr-only"
                                  >
                                    <input
                                      className={`${inputClass} w-full`}
                                      disabled={controlsDisabled}
                                      onChange={(e) =>
                                        updateLine(
                                          draft,
                                          setDraft,
                                          setDirty,
                                          line.id,
                                          { description: e.target.value },
                                        )
                                      }
                                      required={line.lineType === "custom" || line.lineType === "external"}
                                      title={line.description}
                                      value={line.description}
                                    />
                                    <div className="mt-1 flex min-h-4 flex-wrap items-center gap-2">
                                      <span className={lineTypeTone(line.lineType)}>{lineTypeLabel(line.lineType, copy)}</span>
                                      {line.sku ? <span className="text-[10px] text-zinc-500">SKU {line.sku}</span> : null}
                                    </div>
                                  </Field>
                                )}
                                <p className={`col-span-3 flex items-center gap-2 text-xs xl:col-span-1 xl:min-h-11 ${stockTone.text}`} data-testid="estimate-line-stock">{line.lineType === "product" ? <><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${stockTone.indicator}`} /><span>{line.productUnavailable ? (locale === "ro" ? "Produs indisponibil" : "Товар недоступен") : estimateStockLabel({ stockStatus: line.currentStockStatus, availableQuantity: line.currentAvailableQuantity }, catalogCopy)}</span></> : "—"}</p>
                                <div className="col-span-3 grid grid-cols-3 gap-2 xl:contents">
                                  <Field
                                    label={copy.quantity}
                                    labelClassName="xl:sr-only"
                                  >
                                    <NumberInput
                                      disabled={controlsDisabled}
                                      inputId={`estimate-line-${line.id}-quantity`}
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
                                    label={
                                      line.pricingMode === "direct"
                                        ? copy.customerSellingPrice
                                        : line.pricingMode === "markup"
                                          ? copy.markup
                                          : copy.margin
                                    }
                                    labelClassName="xl:sr-only"
                                  >
                                    <NumberInput
                                      disabled={controlsDisabled}
                                      inputId={`estimate-line-${line.id}-price`}
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
                                    {line.lineType === "product" &&
                                    line.sourcePrice ? (
                                      <span aria-hidden="true" className="mt-1 block text-[11px] font-normal text-zinc-500">
                                        {copy.partnerNovotechPrice}: <strong className="font-semibold text-emerald-700">{line.sourcePrice}</strong>
                                      </span>
                                    ) : null}
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
                                  <details className="relative col-start-3 row-start-1 justify-self-end xl:col-auto xl:row-auto" data-testid="estimate-line-advanced" id={`estimate-line-${line.id}-details`}>
                                    <summary aria-label={copy.lineDetails} title={copy.lineDetails} className="flex size-11 cursor-pointer list-none items-center justify-center rounded text-zinc-600 hover:bg-zinc-100">
                                      <MoreHorizontal className="size-4" />
                                    </summary>
                                    <div className="absolute right-0 z-10 grid w-64 max-w-[calc(100vw-3rem)] gap-2 rounded border border-zinc-200 bg-white p-3 shadow-lg">
                                      <button aria-label={copy.deleteLine} className={`${buttonClass} justify-start text-red-700`} disabled={controlsDisabled || dirty} onClick={() => mutate(() => removeEstimateLineAction(estimate.id, line.id, estimate.revision))} type="button"><Trash2 className="size-4" />{copy.deleteLine}</button>
                                      {line.lineType === "product" ? <Field label={copy.description}>
                                        <input
                                          className={`${inputClass} w-full`}
                                          disabled={controlsDisabled}
                                          maxLength={500}
                                          onChange={(event) =>
                                            updateLine(draft, setDraft, setDirty, line.id, { description: event.target.value })
                                          }
                                          value={line.description}
                                        />
                                      </Field> : null}
                                      <Field label={copy.unit}>
                                        <select
                                          className={`${inputClass} w-full`}
                                          disabled={controlsDisabled}
                                          onChange={(event) =>
                                            updateLine(draft, setDraft, setDirty, line.id, { unit: event.target.value as EstimateUnit })
                                          }
                                          value={line.unit}
                                        >
                                          {units.map((unit) => <option key={unit} value={unit}>{unitLabel(unit, locale)}</option>)}
                                        </select>
                                      </Field>
                                      <Field label={copy.lineDiscount}>
                                        <NumberInput
                                          disabled={controlsDisabled}
                                          onValue={(value) =>
                                            updateLine(draft, setDraft, setDirty, line.id, { lineDiscountPercent: value ?? 0 })
                                          }
                                          value={line.lineDiscountPercent}
                                        />
                                      </Field>
                                    </div>
                                  </details>
                              </div>
                            </div>
                          );
                        })
                      ) : null}
                    </div>
                    <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-3 ${sectionLines.length ? "py-2" : "py-1"}`}>
                      {sectionLines.length ? (
                        <span className="text-xs text-zinc-500">
                          <>
                            {copy.subtotal}{" "}
                            {localizedSectionName.toLocaleLowerCase()}:{" "}
                            <strong className="text-zinc-800">
                              {money(section.total, draft.currencyCode, locale)}
                            </strong>
                          </>
                        </span>
                      ) : <span />}
                      {isDraft ? (
                        <button
                          aria-label={sectionAddLabel(canonical.key, copy)}
                          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45"
                          disabled={controlsDisabled || dirty || !section.targetSectionId}
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
                          <span className="sm:hidden">{copy.add}</span>
                          <span className="hidden sm:inline">
                            {sectionAddLabel(canonical.key, copy)}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
          {isDraft || draft.charges.length ? (
            <details className="border-y border-zinc-200 bg-white" id="estimate-charges" ref={chargesRef}>
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                {copy.extraCharges}
              </summary>
              <Charges copy={copy} draft={draft} disabled={controlsDisabled} update={update} />
            </details>
          ) : null}
        </main>
        <aside className="min-w-0 border-y border-zinc-200 bg-white p-4 xl:sticky xl:top-56">
          <p className="mb-2 text-xs text-zinc-500">{copy.positions}: {draft.lines.length}</p>
          <Summary
            copy={copy}
            currency={draft.currencyCode}
            locale={locale}
            preview={preview.value}
            sections={presentationSections}
            vatMode={draft.vatMode}
            vatRatePercent={draft.vatRatePercent}
          />
          <Link className={`${buttonClass} mt-3 w-full`} href={proposalPreviewHref} prefetch={false}><Eye className="size-4" />{copy.proposalPreview}</Link>
          <EstimateWorkflowPanel
            editorOwnsSave
            draftReadiness={draftReadiness}
            initialProposalAction={initialProposalAction}
            initialWorkflow={workflow}
            onDraftPrimaryAction={runDraftPrimaryAction}
            revision={estimate.revision}
          />
        </aside>
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-3 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur xl:hidden"
        data-testid="estimate-mobile-action-bar"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div
          className={`mx-auto grid max-w-lg gap-2 ${
            mobileShareDocumentId
              ? "grid-cols-[repeat(3,minmax(0,1fr))_3rem]"
              : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]"
          }`}
        >
          <button
            aria-label={copy.mobileAddProduct}
            className={buttonClass}
            disabled={controlsDisabled || dirty || !equipmentSectionId}
            onClick={() =>
              equipmentSectionId &&
              openPickerForSection(equipmentSectionId, "product")
            }
            type="button"
          >
            <Plus className="size-4" />
            {copy.add}
          </button>
          <button
            aria-keyshortcuts="Control+S Meta+S"
            aria-label={copy.mobileSave}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-600"
            disabled={!dirty || controlsDisabled || !preview.value}
            onClick={save}
            type="button"
          >
            <Save className="size-4 shrink-0" />
            <span className="truncate">{saveLabel}</span>
          </button>
          {mobileShareDocumentId ? (
            <EstimatePdfShareAction
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md border border-emerald-700 bg-white px-2 text-xs font-semibold text-emerald-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45"
              documentId={mobileShareDocumentId}
              downloadLabel={copy.downloadPdf}
              errorMessage={copy.shareFailed}
              fallbackMessage={copy.shareFallback}
              fileName={canonicalEstimatePdfFileName(estimate.estimateNumber)}
              preparingLabel={copy.sharePreparing}
              shareLabel={copy.sharePdf}
              text={`${copy.commercialProposal} ${estimate.estimateNumber}`}
              title={copy.commercialProposal}
            />
          ) : null}
          <button
            aria-label={copy.actionsMenu}
            className={buttonClass}
            data-testid="estimate-mobile-actions-trigger"
            onClick={() => setMobileActionsOpen(true)}
            ref={mobileActionsTriggerRef}
            type="button"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </div>
      {mobileActionsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/45 xl:hidden"
          data-testid="estimate-mobile-action-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeMobileActions();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="estimate-mobile-actions-title"
            aria-modal="true"
            className="w-full overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 shadow-2xl"
            data-testid="estimate-mobile-action-sheet"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "a[href], button:not([disabled])",
                ),
              );
              const first = controls[0];
              const last = controls.at(-1);
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            role="dialog"
            style={{
              maxHeight: "calc(100dvh - max(1rem, env(safe-area-inset-top)))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-300" />
            <header className="flex min-h-11 items-center justify-between gap-3 border-b border-zinc-200">
              <h2 className="text-base font-semibold" id="estimate-mobile-actions-title">
                {copy.actionsMenu}
              </h2>
              <button
                aria-label={copy.closeActions}
                autoFocus
                className="inline-flex size-11 items-center justify-center rounded-md text-zinc-600 focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={closeMobileActions}
                type="button"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="grid gap-1 py-2">
              {secondaryActions(true)}
            </div>
          </section>
        </div>
      ) : null}
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
              title={section.customName ?? sectionName(section.config.key, copy)}
            >
              {section.customName ?? sectionName(section.config.key, copy)}
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
  inputId,
}: {
  value: number | null;
  onValue: (value: number | null) => void;
  disabled?: boolean;
  nullable?: boolean;
  inputId?: string;
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
      id={inputId}
      min="0"
      onBlur={(event) => commit(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
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
