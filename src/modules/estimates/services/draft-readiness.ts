import type {
  EstimateDraftReadinessDto,
  EstimateDraftReadinessPrimaryAction,
  EstimateDraftReadinessState,
  EstimateDraftReadinessTarget,
  EstimateReadinessCheck,
  EstimateReadinessDto,
} from "../types";

export type EstimateReadinessLineInput = {
  id: string;
  position: number;
  quantity: number;
  sellingUnitPrice: number | null;
};

export type EstimateReadinessInput = {
  lines: EstimateReadinessLineInput[];
  currencyCode: string;
  totalAmount: number | null;
  hasIncompletePricing: boolean;
};

export type EstimateDraftReadinessInput = EstimateReadinessInput & {
  applicable: boolean;
  dirty: boolean;
  estimateRevision: number;
  canManage: boolean;
  calculationError?: {
    target: EstimateDraftReadinessTarget;
  } | null;
  latestProposal: null | {
    estimateRevision: number;
    status: "prepared" | "sent" | "accepted" | "rejected" | "archived";
    pdfStatus: "queued" | "generating" | "ready" | "failed" | null;
  };
};

export function deriveEstimateReadiness(input: EstimateReadinessInput): EstimateReadinessDto {
  const invalidQuantity = input.lines.find((line) => !Number.isFinite(line.quantity) || line.quantity <= 0) ?? null;
  const missingPrice = input.lines.find((line) => line.sellingUnitPrice === null || !Number.isFinite(line.sellingUnitPrice) || line.sellingUnitPrice < 0) ?? null;
  const checks: EstimateReadinessCheck[] = [
    { code: "has_lines", label: "Добавлена хотя бы одна позиция", passed: input.lines.length > 0 },
    {
      code: "valid_quantities",
      label: invalidQuantity ? "У позиции указано некорректное количество" : "Количество по всем позициям указано",
      passed: invalidQuantity === null,
      lineId: invalidQuantity?.id ?? null,
    },
    {
      code: "complete_prices",
      label: missingPrice || input.hasIncompletePricing ? "У позиции не указана цена" : "Цены по всем позициям указаны",
      passed: !input.hasIncompletePricing && missingPrice === null,
      lineId: missingPrice?.id ?? null,
    },
    { code: "valid_currency", label: "Валюта сметы определена", passed: /^[A-Z]{3}$/.test(input.currencyCode) },
    {
      code: "calculated_total",
      label: "Итоговая сумма рассчитана",
      passed: input.totalAmount !== null && Number.isFinite(input.totalAmount) && input.totalAmount >= 0,
    },
  ];
  return { ready: checks.every((check) => check.passed), checks };
}

export function deriveEstimateDraftReadiness(input: EstimateDraftReadinessInput): EstimateDraftReadinessDto {
  const readiness = deriveEstimateReadiness(input);
  if (!input.applicable) return result(readiness, "not_applicable", null, null, null);

  const failed = readiness.checks.find((check) => !check.passed) ?? null;
  if (failed?.code === "has_lines") {
    return result(readiness, "add_product", allowed(input, "add_product"), { kind: "product_picker" }, null);
  }
  if (failed?.code === "valid_quantities") {
    const line = lineById(input.lines, failed.lineId);
    return result(readiness, "fix_quantity", allowed(input, "focus_line"), lineTarget(line, "quantity"), line?.position ?? null);
  }
  if (failed?.code === "complete_prices") {
    const line = lineById(input.lines, failed.lineId) ?? input.lines[0] ?? null;
    return result(readiness, "fix_price", allowed(input, "focus_line"), lineTarget(line, "price"), line?.position ?? null);
  }
  if (failed?.code === "valid_currency") {
    return result(readiness, "fix_settings", allowed(input, "open_settings"), { kind: "settings", field: "currency" }, null);
  }
  if (input.calculationError || failed?.code === "calculated_total") {
    const target = input.calculationError?.target ?? { kind: "settings", field: "commercial" };
    const line = target?.kind === "line" ? lineById(input.lines, target.lineId) : null;
    return result(readiness, target?.kind === "line" ? "fix_line" : "fix_settings", allowed(input, target?.kind === "line" ? "focus_line" : "open_settings"), target, line?.position ?? null);
  }
  if (input.dirty) return result(readiness, "save_changes", allowed(input, "save"), null, null);

  const currentProposal = input.latestProposal?.status === "prepared"
    && input.latestProposal.estimateRevision === input.estimateRevision
    ? input.latestProposal
    : null;
  if (!currentProposal) return result(readiness, "prepare_proposal", allowed(input, "prepare_proposal"), null, null);
  if (currentProposal.pdfStatus !== "ready") {
    return result(readiness, "prepare_pdf", allowed(input, "generate_pdf"), null, null);
  }
  return result(readiness, "handoff", null, null, null);
}

function allowed<T extends EstimateDraftReadinessPrimaryAction>(input: EstimateDraftReadinessInput, action: T): T | null {
  return input.canManage ? action : null;
}

function lineById(lines: EstimateReadinessLineInput[], lineId: string | null | undefined) {
  return lineId ? lines.find((line) => line.id === lineId) ?? null : null;
}

function lineTarget(line: EstimateReadinessLineInput | null, field: "quantity" | "price"): EstimateDraftReadinessTarget {
  return line ? { kind: "line", lineId: line.id, field } : null;
}

function result(
  readiness: EstimateReadinessDto,
  state: EstimateDraftReadinessState,
  primaryAction: EstimateDraftReadinessPrimaryAction | null,
  target: EstimateDraftReadinessTarget,
  linePosition: number | null,
): EstimateDraftReadinessDto {
  return { ...readiness, state, primaryAction, target, linePosition };
}
