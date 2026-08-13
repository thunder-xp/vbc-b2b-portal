import "server-only";
import { createHash } from "node:crypto";
import type { RetailCartRepository } from "../repositories/retail-cart.repository";
import type { PublicRetailLocale } from "../types";
import { normalizePublicCctvInput, type PublicCctvCalculatorInput } from "./public-cctv-calculator.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RetailCartInputError extends Error { constructor() { super("Invalid retail cart input."); this.name = "RetailCartInputError"; } }
export class RetailCartConflictError extends Error { constructor() { super("Retail cart changed."); this.name = "RetailCartConflictError"; } }
export class RetailCartExpiredError extends Error { constructor() { super("Retail cart expired."); this.name = "RetailCartExpiredError"; } }

export class RetailCartService {
  constructor(private readonly repository: RetailCartRepository) {}
  getCart(tokenHash: string | null, locale: PublicRetailLocale) { return tokenHash ? this.repository.getCart(validHash(tokenHash), locale) : Promise.resolve(null); }
  getSummary(tokenHash: string | null) { return tokenHash ? this.repository.getSummary(validHash(tokenHash)) : Promise.resolve({ distinctItemCount: 0, totalQuantity: 0 }); }
  async addProduct(tokenHash: string, input: { publicProductId: string; quantity: number; source: "catalog" | "product_detail"; requestId: string }) {
    const normalized = { publicProductId: publicId(input.publicProductId), quantity: quantity(input.quantity), source: input.source, requestId: requestId(input.requestId) };
    if (!(["catalog", "product_detail"] as const).includes(normalized.source)) throw new RetailCartInputError();
    try { return await this.repository.addProduct(validHash(tokenHash), { ...normalized, fingerprint: fingerprint(normalized) }); } catch (error) { throw translateCartError(error); }
  }
  async addCctvSystem(tokenHash: string, input: { items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials"; unitCode: "piece" | "meter" | "service" }>; installationIntent: Record<string, boolean> | null; calculatorInput: Record<string, unknown>; workScope: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }>; installationPricing?: Record<string, unknown> | null; requestId: string }) {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) throw new RetailCartInputError();
    const grouped = new Map<string, { publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials"; unitCode: "piece" | "meter" | "service" }>();
    for (const item of input.items) {
      if (!(["equipment", "materials"] as const).includes(item.commercialGroup)) throw new RetailCartInputError();
      if (!( ["piece", "meter", "service"] as const).includes(item.unitCode)) throw new RetailCartInputError();
      const id = publicId(item.publicProductId); const key = `${id}:${item.commercialGroup}:${item.unitCode}`; const previous = grouped.get(key);
      grouped.set(key, { publicProductId: id, commercialGroup: item.commercialGroup, unitCode: item.unitCode, quantity: bundleQuantity((previous?.quantity ?? 0) + item.quantity) });
    }
    const installationIntent = normalizeIntent(input.installationIntent);
    const calculatorInput = normalizePublicCctvInput(input.calculatorInput as PublicCctvCalculatorInput);
    const workScope = normalizeWorkScope(input.workScope);
    const installationPricing = normalizeInstallationPricing(input.installationPricing ?? null, workScope);
    const command = { items: [...grouped.values()], installationIntent, calculatorInput, workScope, installationPricing, requestId: requestId(input.requestId) };
    try { return await this.repository.addBundle(validHash(tokenHash), { ...command, fingerprint: fingerprint(command) }); } catch (error) { throw translateCartError(error); }
  }
  async updateQuantity(tokenHash: string, input: { publicProductId: string; bundleId: string | null; quantity: number; expectedRevision: number }) { try { const bundleId = optionalPublicId(input.bundleId); return await this.repository.updateQuantity(validHash(tokenHash), { publicProductId: publicId(input.publicProductId), bundleId, quantity: bundleId ? bundleQuantity(input.quantity) : quantity(input.quantity), expectedRevision: revision(input.expectedRevision) }); } catch (error) { throw translateConflict(error); } }
  async removeItem(tokenHash: string, input: { publicProductId: string; bundleId: string | null; expectedRevision: number }) { try { return await this.repository.removeItem(validHash(tokenHash), { publicProductId: publicId(input.publicProductId), bundleId: optionalPublicId(input.bundleId), expectedRevision: revision(input.expectedRevision) }); } catch (error) { throw translateConflict(error); } }
}
function validHash(value: string) { if (!/^[0-9a-f]{64}$/.test(value)) throw new RetailCartInputError(); return value; }
function publicId(value: string) { if (!PUBLIC_ID.test(value)) throw new RetailCartInputError(); return value.toLowerCase(); }
function optionalPublicId(value: string | null) { return value === null ? null : publicId(value); }
function quantity(value: number) { if (!Number.isInteger(value) || value < 1 || value > 99) throw new RetailCartInputError(); return value; }
function bundleQuantity(value: number) { if (!Number.isInteger(value) || value < 1 || value > 20_000) throw new RetailCartInputError(); return value; }
function revision(value: number) { if (!Number.isInteger(value) || value < 0) throw new RetailCartInputError(); return value; }
function requestId(value: string) { if (!UUID.test(value)) throw new RetailCartInputError(); return value.toLowerCase(); }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function normalizeIntent(value: Record<string, boolean> | null) { if (!value) return null; const keys = ["cameraInstallation", "cableLaying", "commissioning", "remoteViewing"] as const; if (Object.keys(value).some((key) => !keys.includes(key as typeof keys[number])) || keys.some((key) => typeof value[key] !== "boolean")) throw new RetailCartInputError(); return Object.fromEntries(keys.map((key) => [key, value[key]])); }
function normalizeWorkScope(value: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }>) { const kinds = ["camera_installation", "cable_laying", "commissioning", "remote_configuration"]; if (!Array.isArray(value) || value.length > 20 || value.some((item) => !kinds.includes(item.kind) || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 20_000 || !(["piece", "meter", "service"] as const).includes(item.unitCode))) throw new RetailCartInputError(); return value.map((item) => ({ kind: item.kind, quantity: item.quantity, unitCode: item.unitCode })); }
function normalizeInstallationPricing(value: Record<string, unknown> | null, workScope: Array<{ kind: string; quantity: number; unitCode: string }>) {
  if (!workScope.length) return null;
  if (!value || value.complete !== true || typeof value.tariffSetId !== "string" || !PUBLIC_ID.test(value.tariffSetId)
    || !Number.isInteger(value.tariffVersion) || !Array.isArray(value.lines) || typeof value.subtotal !== "number") throw new RetailCartInputError();
  return value;
}
function translateConflict(error: unknown) { return error && typeof error === "object" && "code" in error && error.code === "PT409" ? new RetailCartConflictError() : error; }
function translateCartError(error: unknown) { return error && typeof error === "object" && "code" in error && error.code === "28000" ? new RetailCartExpiredError() : error; }
