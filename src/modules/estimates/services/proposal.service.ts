import { createHash } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import { normalizeProductImageUrl } from "../../catalog/components/product-image-source";
import type { EstimateRepository, ProposalRepository } from "../repositories";
import type { CustomerProposalDto, GeneratedEstimateDocument, ProposalSettings, ProposalTemplate } from "../types";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const PDF_PERMISSION = "estimates.generate_pdf";
const STORAGE_BUCKET = "estimate-proposals";

export type ProposalPreviewDto = {
  proposal: CustomerProposalDto;
  estimateId: string;
  estimateRevision: number;
  selectedTemplateId: string | null;
  templates: ProposalTemplate[];
};

export type VersionProposalPreviewDto = {
  proposal: CustomerProposalDto;
  estimateId: string;
  versionId: string;
  versionNumber: number;
};

export const DEFAULT_PROPOSAL_SETTINGS: ProposalSettings = {
  title: "Коммерческое предложение",
  introduction: "Предлагаем решение для вашего проекта на следующих условиях.",
  deliveryTerms: "Срок поставки согласовывается после подтверждения заказа.",
  paymentTerms: "Условия оплаты согласовываются сторонами.",
  warrantyTerms: "Гарантия предоставляется в соответствии с условиями производителя.",
  validityText: "Предложение действительно в течение срока, указанного в смете.",
  installationNotes: "", exclusions: "", customerNote: "", footerNote: "",
  showProductImages: true, showSku: true, showUnitPrice: true, showLineDiscount: true,
  showSectionSubtotals: true, showVatBreakdown: true, showPartnerLogo: true,
};

export class DefaultProposalService {
  constructor(
    private readonly estimateRepository: EstimateRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async preparePreview(userId: string, estimateId: string): Promise<ProposalPreviewDto> {
    const context = await this.resolveContext(userId, VIEW_PERMISSION);
    const aggregate = await this.estimateRepository.findAggregateById(normalizeId(estimateId));
    if (!aggregate || aggregate.estimate.companyId !== context.company.id) throw new NotFoundError("Estimate was not found.");
    if (aggregate.estimate.hasIncompletePricing || aggregate.items.some((item) => item.sellingUnitPrice === null || item.lineTotal === null)) {
      throw new InvalidStateError("Заполните цены всех позиций перед подготовкой предложения.");
    }

    const productIds = aggregate.items.flatMap((item) => item.productId ? [item.productId] : []);
    const [templates, profile, images] = await Promise.all([
      this.proposalRepository.listTemplates(context.company.id),
      this.proposalRepository.getBranding(context.company.id),
      this.proposalRepository.getProductImages(productIds),
    ]);
    const stored = { templateId: aggregate.estimate.proposalTemplateId ?? null, settings: aggregate.estimate.proposalSettings ?? {} };
    const normalizedTemplates = templates.map((template) => ({ ...template, configuration: normalizeSettings({ ...DEFAULT_PROPOSAL_SETTINGS, ...template.configuration }) }));
    const selectedTemplate = normalizedTemplates.find((template) => template.id === stored.templateId) ?? normalizedTemplates.find((template) => template.key === "equipment_supply") ?? normalizedTemplates[0];
    const settings = normalizeSettings({ ...DEFAULT_PROPOSAL_SETTINGS, ...selectedTemplate?.configuration, ...stored.settings });
    const dto = prepareCustomerProposal({ aggregate, settings, companyName: context.company.displayName, userName: context.user.fullName, userEmail: context.user.email, userPhone: context.user.phone, profile, images });
    console.info({ event: "estimate_proposal_preview_prepared", estimateId: aggregate.estimate.id, companyId: context.company.id, lineCount: aggregate.items.length });
    return { proposal: dto, estimateId: aggregate.estimate.id, estimateRevision: aggregate.estimate.revision, selectedTemplateId: selectedTemplate?.id ?? null, templates: normalizedTemplates };
  }

  async saveSettings(userId: string, estimateId: string, expectedRevision: number, templateId: string | null, settings: ProposalSettings) {
    const context = await this.resolveContext(userId, MANAGE_PERMISSION);
    const estimate = await this.estimateRepository.findById(normalizeId(estimateId));
    if (!estimate || estimate.companyId !== context.company.id) throw new NotFoundError("Estimate was not found.");
    const normalized = normalizeSettings(settings);
    const revision = await this.proposalRepository.saveSettings({ estimateId: estimate.id, expectedRevision, templateId: templateId ? normalizeId(templateId) : null, settings: normalized });
    console.info({ event: "estimate_proposal_settings_updated", estimateId: estimate.id, companyId: context.company.id, revision });
    return { revision };
  }

  async copyTemplate(userId: string, sourceTemplateId: string, name: string): Promise<ProposalTemplate> {
    const context = await this.resolveContext(userId, "proposal_templates.manage");
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 120) throw new InvalidStateError("Укажите название шаблона.");
    return this.proposalRepository.copyTemplate({ companyId: context.company.id, sourceTemplateId: normalizeId(sourceTemplateId), name: normalizedName });
  }

  async prepareVersionPreview(userId: string, versionId: string): Promise<VersionProposalPreviewDto> {
    const context = await this.resolveContext(userId, VIEW_PERMISSION);
    const version = await this.proposalRepository.findVersionProposal(normalizeId(versionId));
    if (!version || version.companyId !== context.company.id) throw new NotFoundError("Версия сметы не найдена.");
    return { proposal: deepFreeze(version.proposal), estimateId: version.estimateId, versionId: normalizeId(versionId), versionNumber: version.versionNumber };
  }

  async generateVersionPdf(userId: string, versionId: string): Promise<GeneratedEstimateDocument> {
    const preview = await this.prepareVersionPreview(userId, versionId);
    return this.generatePreparedVersionPdf(userId, preview);
  }

  async generatePreparedVersionPdf(userId: string, preview: VersionProposalPreviewDto): Promise<GeneratedEstimateDocument> {
    const context = await this.resolveContext(userId, PDF_PERMISSION);
    const fingerprint = createHash("sha256").update(`version:${preview.versionId}:${stableJson(preview.proposal)}`).digest("hex");
    let document = await this.proposalRepository.claimVersionGeneration({ versionId: preview.versionId, fingerprint });
    if (document.status === "ready" || document.status === "generating") return document;
    await this.proposalRepository.markGenerating(document.id);
    try {
      const { renderProposalPdf } = await import("./proposal-pdf.renderer");
      const rendered = await renderProposalPdf(preview.proposal);
      const key = `${context.company.id}/${preview.estimateId}/versions/${preview.versionId}/${document.id}.pdf`;
      await this.proposalRepository.uploadPdf(STORAGE_BUCKET, key, rendered.bytes);
      const checksum = createHash("sha256").update(rendered.bytes).digest("hex");
      await this.proposalRepository.markReady({ documentId: document.id, bucket: STORAGE_BUCKET, key, pageCount: rendered.pageCount, fileSizeBytes: rendered.bytes.byteLength, checksumSha256: checksum });
      document = (await this.proposalRepository.findDocument(document.id)) ?? document;
      console.info({ event: "estimate_version_pdf_generation_completed", estimateId: preview.estimateId, versionId: preview.versionId, documentId: document.id, pageCount: rendered.pageCount });
      return document;
    } catch (error) {
      await this.proposalRepository.markFailed(document.id, "Не удалось сформировать PDF.");
      console.error({ event: "estimate_version_pdf_generation_failed", estimateId: preview.estimateId, versionId: preview.versionId, errorName: error instanceof Error ? error.name : typeof error });
      throw error;
    }
  }

  async generatePdf(userId: string, estimateId: string): Promise<GeneratedEstimateDocument> {
    void userId;
    void estimateId;
    throw new InvalidStateError("Сначала создайте версию предложения. PDF формируется только для зафиксированной версии.");
  }

  async downloadPdf(userId: string, documentId: string): Promise<{ bytes: Uint8Array; filename: string }> {
    const context = await this.resolveContext(userId, VIEW_PERMISSION);
    const document = await this.proposalRepository.findDocument(normalizeId(documentId));
    if (!document || document.companyId !== context.company.id || document.status !== "ready" || !document.storageBucket || !document.storageKey) throw new NotFoundError("Document was not found.");
    return { bytes: await this.proposalRepository.downloadPdf(document.storageBucket, document.storageKey), filename: "commercial-proposal.pdf" };
  }

  private async resolveContext(userId: string, permission: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context;
  }
}

function prepareCustomerProposal(input: {
  aggregate: Awaited<ReturnType<EstimateRepository["findAggregateById"]>> & {};
  settings: ProposalSettings; companyName: string; userName: string | null; userEmail: string; userPhone: string | null;
  profile: Partial<import("../types").ProposalBranding> | null; images: Map<string, string | null>;
}): CustomerProposalDto {
  const { estimate, sections, items, charges } = input.aggregate;
  const sectionRows = [...sections].sort((a, b) => a.sortOrder - b.sortOrder).map((section) => {
    const lines = items.filter((item) => item.sectionId === section.id).sort((a, b) => a.position - b.position).map((item) => ({
      position: item.position, lineType: item.lineType, description: item.description, sku: item.skuSnapshot,
      imageUrl: item.productId ? normalizeProposalProductImageUrl(input.images.get(item.productId) ?? null) : null,
      quantity: item.quantity, unitLabel: unitLabel(item.unit), unitPrice: item.sellingUnitPrice!,
      lineDiscountPercent: item.lineDiscountPercent, lineTotal: item.lineTotal!,
    }));
    return { name: section.name, subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0), lines };
  });
  const customerCharges = charges.filter((charge) => charge.customerVisible).sort((a, b) => a.sortOrder - b.sortOrder).map((charge) => ({ description: charge.description, amount: charge.amount }));
  return deepFreeze({
    schemaVersion: "2026-07-16-v1" as const, estimateNumber: estimate.estimateNumber,
    generatedForDate: new Date().toISOString().slice(0, 10), customerName: estimate.customerName, projectName: estimate.projectName,
    currencyCode: estimate.currencyCode, settings: { ...input.settings },
    branding: { companyName: input.companyName, legalName: input.profile?.legalName ?? null, contactName: input.profile?.contactName ?? input.userName, phone: input.profile?.phone ?? input.userPhone, email: input.profile?.email ?? input.userEmail, website: input.profile?.website ?? null, fiscalInformation: input.profile?.fiscalInformation ?? null, address: input.profile?.address ?? null, logoUrl: normalizePortalImageUrl(input.profile?.logoUrl ?? null) },
    sections: sectionRows, charges: customerCharges,
    totals: { subtotal: estimate.subtotalAmount, discounts: estimate.lineDiscountTotal + estimate.sectionDiscountTotal + estimate.globalDiscountAmount, charges: estimate.chargesTotal, totalExcludingVat: estimate.totalExcludingVat, vat: estimate.vatAmount, total: estimate.totalAmount },
  });
}

export function normalizeSettings(input: Partial<ProposalSettings>): ProposalSettings {
  const text = (key: keyof ProposalSettings, max: number) => typeof input[key] === "string" ? String(input[key]).trim().slice(0, max) : String(DEFAULT_PROPOSAL_SETTINGS[key]);
  const flag = (key: keyof ProposalSettings) => typeof input[key] === "boolean" ? Boolean(input[key]) : Boolean(DEFAULT_PROPOSAL_SETTINGS[key]);
  const title = text("title", 200);
  if (!title) throw new InvalidStateError("Укажите заголовок предложения.");
  return { title, introduction: text("introduction", 4000), deliveryTerms: text("deliveryTerms", 2000), paymentTerms: text("paymentTerms", 2000), warrantyTerms: text("warrantyTerms", 2000), validityText: text("validityText", 1000), installationNotes: text("installationNotes", 2000), exclusions: text("exclusions", 2000), customerNote: text("customerNote", 2000), footerNote: text("footerNote", 1000), showProductImages: flag("showProductImages"), showSku: flag("showSku"), showUnitPrice: flag("showUnitPrice"), showLineDiscount: flag("showLineDiscount"), showSectionSubtotals: flag("showSectionSubtotals"), showVatBreakdown: flag("showVatBreakdown"), showPartnerLogo: flag("showPartnerLogo") };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalizeId(value: string): string { const normalized = value.trim(); if (!normalized) throw new NotFoundError("Estimate was not found."); return normalized; }
function unitLabel(unit: string): string { return ({ pcs: "шт.", hour: "час", meter: "м", set: "компл.", visit: "выезд", service: "услуга" } as Record<string, string>)[unit] ?? unit; }
function normalizeProposalProductImageUrl(value: string | null): string | null {
  return normalizeProductImageUrl(value) ?? normalizePortalImageUrl(value);
}

function normalizePortalImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value); const hosts = new Set(["www.nsd.md", "nsd.md"]);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
    const sensitiveQuery = [...url.searchParams.keys()].some((key) => /token|signature|apikey|authorization/i.test(key));
    return url.protocol === "https:" && !url.username && !url.password && !sensitiveQuery && hosts.has(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => deepFreeze(item));
    Object.freeze(value);
  }
  return value;
}
