"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  invalidInput,
  success,
  type ActionResult,
} from "../access-control/actions/action-result";
import { getPartnerWorkspaceContextAction } from "../partner-cabinet/actions";
import { getPartnerLocale } from "../partner-locale/server";
import { requireAdminPermission } from "../admin/services";
import { hasValidFileSignature } from "../service-center/attachment-policy";
import {
  COMPETITIVE_INTELLIGENCE_CURRENCIES,
  COMPETITIVE_INTELLIGENCE_MAX_EVIDENCE_BYTES,
  COMPETITIVE_INTELLIGENCE_MIME_TYPES,
  COMPETITIVE_INTELLIGENCE_SOURCE_TYPES,
  COMPETITIVE_INTELLIGENCE_VAT_MODES,
} from "./service";
import {
  CompetitiveIntelligenceRepository,
  CompetitiveIntelligenceRepositoryError,
} from "./repository";
import type { CompetitiveObservationReceipt } from "./types";

const repository = new CompetitiveIntelligenceRepository();

export async function createCompetitiveObservationAction(
  _state: ActionResult<CompetitiveObservationReceipt> | null,
  formData: FormData,
): Promise<ActionResult<CompetitiveObservationReceipt>> {
  const locale = await getPartnerLocale();
  let uploadedKey: string | null = null;
  try {
    const workspace = await getPartnerWorkspaceContextAction();
    if (!workspace.success || workspace.data.accessState !== "active" || !workspace.data.companyId) {
      return invalidInput(locale === "ro" ? "Este necesar accesul activ la companie." : "Требуется активный доступ к компании.");
    }
    if (!workspace.data.capabilities.canManageCompetitiveIntelligence) {
      return invalidInput(locale === "ro" ? "Nu aveți dreptul de a salva observații." : "Недостаточно прав для сохранения наблюдения.");
    }

    const productId = uuid(formData, "productId");
    const idempotencyKey = uuid(formData, "idempotencyKey");
    const competitorSelection = text(formData, "competitorId");
    const otherCompetitorName = optionalText(formData, "otherCompetitorName", 120);
    const competitorId = competitorSelection === "other" ? null : validateUuid(competitorSelection);
    if ((competitorId === null) === (otherCompetitorName === null)) {
      return invalidInput(locale === "ro" ? "Selectați concurentul." : "Выберите конкурента.");
    }

    const observedPrice = positiveNumber(formData, "price", 4);
    const quantity = positiveNumber(formData, "quantity", 3);
    const currency = enumValue(formData, "currency", COMPETITIVE_INTELLIGENCE_CURRENCIES);
    const vatMode = enumValue(formData, "vatMode", COMPETITIVE_INTELLIGENCE_VAT_MODES);
    const sourceType = enumValue(formData, "sourceType", COMPETITIVE_INTELLIGENCE_SOURCE_TYPES);
    const observationDate = dateValue(formData, "observationDate", true)!;
    const validUntil = dateValue(formData, "validUntil", false);
    if (validUntil && validUntil < observationDate) return invalidInput(locale === "ro" ? "Termenul de valabilitate este incorect." : "Срок действия указан неверно.");

    const evidenceFile = formData.get("evidence");
    let evidence: Record<string, unknown> | null = null;
    if (evidenceFile instanceof File && evidenceFile.size > 0) {
      if (evidenceFile.size > COMPETITIVE_INTELLIGENCE_MAX_EVIDENCE_BYTES ||
        !COMPETITIVE_INTELLIGENCE_MIME_TYPES.includes(evidenceFile.type as (typeof COMPETITIVE_INTELLIGENCE_MIME_TYPES)[number])) {
        return invalidInput(locale === "ro" ? "Fișierul trebuie să fie JPG, PNG, WebP sau PDF și să nu depășească 10 MB." : "Файл должен быть JPG, PNG, WebP или PDF размером не более 10 МБ.");
      }
      const bytes = new Uint8Array(await evidenceFile.arrayBuffer());
      if (!hasValidFileSignature(bytes, evidenceFile.type)) {
        return invalidInput(locale === "ro" ? "Conținutul fișierului nu corespunde formatului." : "Содержимое файла не соответствует формату.");
      }
      const checksum = createHash("sha256").update(bytes).digest("hex");
      uploadedKey = `${workspace.data.companyId}/${productId}/${idempotencyKey}/${safeFileName(evidenceFile.name)}`;
      await repository.uploadEvidence(uploadedKey, bytes, evidenceFile.type);
      evidence = {
        storageKey: uploadedKey,
        fileName: evidenceFile.name.slice(0, 240),
        mimeType: evidenceFile.type,
        fileSize: evidenceFile.size,
        checksumSha256: checksum,
      };
    }

    const receipt = await repository.createObservation({
      p_company_id: workspace.data.companyId,
      p_product_id: productId,
      p_competitor_id: competitorId,
      p_submitted_competitor_name: competitorId ? null : otherCompetitorName,
      p_observed_price: observedPrice,
      p_currency: currency,
      p_vat_mode: vatMode,
      p_quantity: quantity,
      p_observation_date: observationDate,
      p_source_type: sourceType,
      p_valid_until: validUntil,
      p_payment_terms: optionalText(formData, "paymentTerms", 500),
      p_delivery_terms: optionalText(formData, "deliveryTerms", 500),
      p_comment: optionalText(formData, "comment", 1000),
      p_idempotency_key: idempotencyKey,
      p_supersedes_observation_id: optionalUuid(formData, "supersedesObservationId"),
      p_evidence: evidence,
    });
    if (uploadedKey && (receipt.duplicate || receipt.idempotent)) {
      await repository.removeEvidence(uploadedKey);
      uploadedKey = null;
    }
    return success(
      receipt.duplicate
        ? locale === "ro" ? "Această observație este deja salvată." : "Такое наблюдение уже сохранено."
        : locale === "ro" ? "Prețul concurentului a fost salvat." : "Цена конкурента сохранена.",
      receipt,
    );
  } catch (error) {
    if (uploadedKey) await repository.removeEvidence(uploadedKey);
    if (error instanceof CompetitiveIntelligenceRepositoryError) {
      if (error.code === "42501") return invalidInput(locale === "ro" ? "Acțiunea nu este permisă." : "Действие недоступно.");
      if (error.code === "22023") return invalidInput(locale === "ro" ? "Verificați datele introduse." : "Проверьте введённые данные.");
      if (error.code === "PT409") return invalidInput(locale === "ro" ? "Datele s-au schimbat. Reîncercați." : "Данные изменились. Повторите действие.");
    }
    console.error({ event: "competitive_observation_create_failed", errorType: error instanceof Error ? error.name : typeof error });
    return invalidInput(locale === "ro" ? "Prețul nu a putut fi salvat. Reîncercați." : "Не удалось сохранить цену. Повторите попытку.");
  }
}

export async function reconcileCompetitiveCompetitorAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  const target = text(formData, "target");
  await repository.reconcileCompetitor({
    queueId: uuid(formData, "queueId"),
    competitorId: target === "new" ? null : validateUuid(target),
    canonicalName: target === "new" ? requiredText(formData, "canonicalName", 120) : null,
    reason: requiredText(formData, "reason", 500),
  });
  revalidatePath("/admin/market-intelligence");
}

export async function reviewCompetitiveObservationAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  await repository.reviewObservation(
    uuid(formData, "observationId"),
    enumValue(formData, "decision", ["include", "exclude", "evidence_verified", "evidence_rejected"] as const),
    requiredText(formData, "reason", 500),
  );
  revalidatePath(`/admin/market-intelligence/products/${uuid(formData, "productId")}`);
}

export async function acknowledgeCompetitiveRecommendationAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  await repository.acknowledgeRecommendation(
    uuid(formData, "recommendationId"),
    enumValue(formData, "action", ["acknowledge", "suppress"] as const),
    requiredText(formData, "reason", 500),
  );
  revalidatePath("/admin/market-intelligence");
}

export async function reviewCompetitiveSignalAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  const productId = uuid(formData, "productId");
  await repository.reviewSignal(
    uuid(formData, "signalId"),
    enumValue(formData, "action", ["suppress", "restore"] as const),
    requiredText(formData, "reason", 500),
  );
  revalidatePath(`/admin/market-intelligence/products/${productId}`);
  revalidatePath("/admin/market-intelligence");
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function requiredText(formData: FormData, key: string, max: number) {
  const value = text(formData, key);
  if (!value || value.length > max) throw new Error("INVALID_INPUT");
  return value;
}
function optionalText(formData: FormData, key: string, max: number) {
  const value = text(formData, key);
  if (value.length > max) throw new Error("INVALID_INPUT");
  return value || null;
}
function positiveNumber(formData: FormData, key: string, precision: number) {
  const raw = text(formData, key).replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || !new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(raw)) throw new Error("INVALID_INPUT");
  return value;
}
function enumValue<const T extends readonly string[]>(formData: FormData, key: string, values: T): T[number] {
  const value = text(formData, key);
  if (!values.includes(value)) throw new Error("INVALID_INPUT");
  return value as T[number];
}
function validateUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("INVALID_INPUT");
  return value;
}
function uuid(formData: FormData, key: string) { return validateUuid(text(formData, key)); }
function optionalUuid(formData: FormData, key: string) { const value = text(formData, key); return value ? validateUuid(value) : null; }
function dateValue(formData: FormData, key: string, required: boolean) {
  const value = text(formData, key);
  if (!value && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new Error("INVALID_INPUT");
  return value;
}
function safeFileName(value: string) {
  return `${randomUUID()}-${value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-120) || "evidence"}`;
}
