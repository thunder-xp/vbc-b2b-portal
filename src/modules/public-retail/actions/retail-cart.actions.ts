"use server";

import { getOrCreateRetailCartTokenHash, getRetailCartTokenHash, rotateRetailCartTokenHash } from "../retail-cart-cookie";
import { getRetailCartService } from "../retail-cart-server";
import { getPublicCctvCalculatorService } from "../server";
import { RetailCartExpiredError } from "../services/retail-cart.service";
import { normalizePublicCctvInput, type PublicCctvCalculatorInput } from "../services/public-cctv-calculator.service";
import type { PublicRetailCartMutationDto, PublicRetailLocale } from "../types";

export type RetailCartActionResult = { success: boolean; message: string; data: PublicRetailCartMutationDto | null };
const fail = (message: string): RetailCartActionResult => ({ success: false, message, data: null });

export async function addPublicRetailProductAction(input: { publicProductId: string; quantity: number; source: "catalog" | "product_detail"; requestId: string; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  try {
    const data = await withExpiredCartRecovery((hash) => getRetailCartService().addProduct(hash, input));
    return { success: true, message: input.locale === "ro" ? "Produsul a fost adăugat în coș." : "Товар добавлен в корзину.", data };
  } catch (error) {
    safeCartFailure("add_product", error);
    return fail(input.locale === "ro" ? "Produsul nu a putut fi adăugat. Reîncercați." : "Не удалось добавить товар. Повторите попытку.");
  }
}

export async function addPublicRetailCctvSystemAction(input: { items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials"; unitCode: "piece" | "meter" | "service" }>; installationIntent: Record<string, boolean> | null; calculatorInput: Record<string, unknown>; workScope: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }>; installationPricing: Record<string, unknown> | null; requestId: string; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  try {
    const calculatorInput = normalizedCalculatorCommandInput(input.calculatorInput);
    const calculation = await getPublicCctvCalculatorService().calculate(calculatorInput);
    const selectedVariant = input.calculatorInput.selectedVariant === "economy" ? "economy" : "recommended";
    const selectedLines = selectedVariant === "economy" && calculation.economyLines
      ? calculation.economyLines
      : calculation.lines;
    const governedItems = selectedLines.flatMap((line) => line.kind === "product" && line.product ? [{
      publicProductId: line.product.id,
      quantity: line.quantity,
      commercialGroup: line.group === "materials" ? "materials" as const : "equipment" as const,
      unitCode: line.unitCode,
    }] : []);
    const governedWorkScope = selectedLines.flatMap((line) => line.kind === "work" ? [{
      kind: line.requirementKind,
      quantity: line.quantity,
      unitCode: line.unitCode,
    }] : []);
    const governedInstallationIntent = governedWorkScope.length ? {
      cameraInstallation: calculatorInput.cameraInstallationRequested,
      cableLaying: calculatorInput.cableLayingRequested,
      commissioning: calculatorInput.commissioningRequested,
      remoteViewing: calculatorInput.remoteViewingRequested,
      aiScenarioProgramming: calculatorInput.aiScenarioProgrammingRequested,
    } : null;
    const governedInput = {
      ...calculatorInput,
      selectedVariant,
      policyVersion: calculation.cameraSelection.policyVersion,
      provisionalRequirements: calculation.provisionalRequirements,
      ...(calculation.provisionalRequirements.length ? { paymentEligibility: "blocked_unresolved_requirements" as const } : {}),
    };
    const data = await withExpiredCartRecovery((hash) => getRetailCartService().addCctvSystem(hash, {
      items: governedItems,
      installationIntent: governedInstallationIntent,
      calculatorInput: governedInput,
      workScope: governedWorkScope,
      installationPricing: calculation.installationPricing,
      requestId: input.requestId,
    }));
    console.info({ event: selectedVariant === "economy" ? "economy_selected" : "recommended_selected", source: "public_cctv_calculator" });
    const provisional = calculation.provisionalRequirements.length > 0;
    return { success: true, message: provisional
      ? (input.locale === "ro" ? "Pozițiile confirmate au fost adăugate. Restul vor fi precizate de manager." : "Известные позиции добавлены. Остальные уточнит менеджер.")
      : (input.locale === "ro" ? "Sistemul a fost adăugat în coș." : "Система добавлена в корзину."), data };
  } catch (error) {
    safeCartFailure("add_cctv_system", error);
    return fail(input.locale === "ro" ? "Configurația s-a modificat. Recalculați sistemul." : "Конфигурация изменилась. Пересчитайте систему.");
  }
}

function normalizedCalculatorCommandInput(input: Record<string, unknown>): PublicCctvCalculatorInput {
  return normalizePublicCctvInput({
    locale: input.locale,
    objectType: input.objectType,
    indoorCameraCount: input.indoorCameraCount,
    outdoorCameraCount: input.outdoorCameraCount,
    quality: input.quality,
    archiveDays: input.archiveDays,
    cableLength: input.cableLength,
    cameraInstallationRequested: input.cameraInstallationRequested,
    cableLayingRequested: input.cableLayingRequested,
    commissioningRequested: input.commissioningRequested,
    remoteViewingRequested: input.remoteViewingRequested,
    aiScenarioProgrammingRequested: input.aiScenarioProgrammingRequested,
    backupPower: input.backupPower,
  } as PublicCctvCalculatorInput);
}

export async function updatePublicRetailCartQuantityAction(input: { publicProductId: string; bundleId: string | null; quantity: number; expectedRevision: number; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  const hash = await getRetailCartTokenHash();
  if (!hash) return fail(input.locale === "ro" ? "Coșul nu mai este disponibil." : "Корзина больше недоступна.");
  try {
    const data = await getRetailCartService().updateQuantity(hash, input);
    return { success: true, message: input.locale === "ro" ? "Cantitatea a fost actualizată." : "Количество обновлено.", data };
  } catch (error) {
    safeCartFailure("update_quantity", error);
    return fail(input.locale === "ro" ? "Coșul s-a modificat. Reîncărcați pagina." : "Корзина изменилась. Обновите страницу.");
  }
}

export async function removePublicRetailCartItemAction(input: { publicProductId: string; bundleId: string | null; expectedRevision: number; locale: PublicRetailLocale }): Promise<RetailCartActionResult> {
  const hash = await getRetailCartTokenHash();
  if (!hash) return fail(input.locale === "ro" ? "Coșul nu mai este disponibil." : "Корзина больше недоступна.");
  try {
    const data = await getRetailCartService().removeItem(hash, input);
    return { success: true, message: input.locale === "ro" ? "Produsul a fost eliminat." : "Товар удалён.", data };
  } catch (error) {
    safeCartFailure("remove_item", error);
    return fail(input.locale === "ro" ? "Coșul s-a modificat. Reîncărcați pagina." : "Корзина изменилась. Обновите страницу.");
  }
}

async function withExpiredCartRecovery(operation: (tokenHash: string) => Promise<PublicRetailCartMutationDto>) {
  try {
    return await operation(await getOrCreateRetailCartTokenHash());
  } catch (error) {
    if (!(error instanceof RetailCartExpiredError)) throw error;
    return operation(await rotateRetailCartTokenHash());
  }
}

function safeCartFailure(operation: string, error: unknown) {
  console.error({ event: "public_retail_cart_mutation_failed", operation, errorName: error instanceof Error ? error.name : typeof error });
}
