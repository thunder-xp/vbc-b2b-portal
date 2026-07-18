import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { EstimateLifecycleRepository, ProposalDeliveryRepository } from "../repositories";
import type { ProposalCustomerResponse, ProposalDeliveryLocale, PublicProposalDto } from "../types";
import type { DefaultProposalService, VersionProposalPreviewDto } from "./proposal.service";
import { ProposalEmailProviderError, type ProposalEmailProvider } from "./proposal-email.provider";

const SEND_PERMISSION = "proposal.send";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export class ProposalDeliveryService {
  constructor(
    private readonly repository: ProposalDeliveryRepository,
    private readonly lifecycleRepository: EstimateLifecycleRepository,
    private readonly proposalService: DefaultProposalService,
    private readonly emailProvider: ProposalEmailProvider,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async send(userId: string, input: {
    versionId: string; recipientEmail: string; recipientName?: string; subject: string; message?: string;
    locale: ProposalDeliveryLocale; expirationDays: number; attachPdf: boolean; idempotencyKey: string;
  }): Promise<{ estimateId: string; deliveryId: string; status: string; publicUrl: string | null; attachedPdf: boolean }> {
    const companyId = await this.resolveCompany(userId);
    const version = await this.lifecycleRepository.findVersion(normalizeId(input.versionId));
    if (!version || version.companyId !== companyId) throw new NotFoundError("Версия предложения не найдена.");
    if (version.status !== "prepared" && version.status !== "sent") throw new InvalidStateError("Отправить можно только подготовленную или уже отправленную версию.");
    const recipientEmail = normalizeEmail(input.recipientEmail);
    const subject = normalizeHeader(input.subject, 200, "Укажите тему письма.");
    const recipientName = normalizeOptional(input.recipientName, 160);
    const message = normalizeOptional(input.message, 4000);
    const expirationDays = normalizeExpiration(input.expirationDays);
    const preview = await this.proposalService.prepareVersionPreview(userId, version.id);
    const document = await this.proposalService.generatePreparedVersionPdf(userId, preview);
    if (document.status !== "ready") throw new InvalidStateError("PDF предложения ещё формируется. Повторите отправку позже.");

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const claimed = await this.repository.claim({
      versionId: version.id, documentId: document.id, recipientEmail, recipientName, subject, message,
      locale: normalizeLocale(input.locale), tokenHash,
      expiresAt: new Date(Date.now() + expirationDays * 86_400_000).toISOString(),
      idempotencyKey: normalizeUuid(input.idempotencyKey),
    });
    const ownsRawToken = claimed.tokenHash === tokenHash;
    if (!ownsRawToken) {
      return { estimateId: claimed.estimateId, deliveryId: claimed.id, status: claimed.status, publicUrl: null, attachedPdf: false };
    }
    if (["sent", "delivered", "responded"].includes(claimed.status)) {
      return { estimateId: claimed.estimateId, deliveryId: claimed.id, status: claimed.status, publicUrl: publicUrl(rawToken), attachedPdf: false };
    }
    console.info(observation("proposal_delivery_created", claimed, companyId));
    if (version.status === "sent") console.info(observation("proposal_delivery_retry_started", claimed, companyId));
    const started = await this.repository.start(claimed.id);
    if (started.status !== "sending") return { estimateId: started.estimateId, deliveryId: started.id, status: started.status, publicUrl: publicUrl(rawToken), attachedPdf: false };

    const link = publicUrl(rawToken);
    let attachment: { filename: string; content: Uint8Array } | undefined;
    if (input.attachPdf && document.fileSizeBytes !== null && document.fileSizeBytes <= MAX_ATTACHMENT_BYTES) {
      try {
        const downloaded = await this.proposalService.downloadPdf(userId, document.id);
        attachment = { filename: `${preview.proposal.estimateNumber}.pdf`, content: downloaded.bytes };
      } catch (error) {
        console.warn({ event: "proposal_delivery_attachment_unavailable", deliveryId: claimed.id, errorName: error instanceof Error ? error.name : typeof error });
      }
    }
    const email = buildEmail(preview, input.locale, link, claimed.tokenExpiresAt, recipientName, message, attachment);
    const startedAt = performance.now();
    console.info(observation("proposal_delivery_send_started", claimed, companyId));
    try {
      const providerStartedAt = performance.now();
      const providerResult = await this.emailProvider.send({ to: recipientEmail, subject, ...email });
      const providerDurationMs = Math.round(performance.now() - providerStartedAt);
      const completed = await this.repository.complete(claimed.id, providerResult.messageId);
      console.info({ ...observation("proposal_delivery_sent", completed, companyId), durationMs: Math.round(performance.now() - startedAt), providerDurationMs, providerResultCategory: providerResult.category });
      return { estimateId: completed.estimateId, deliveryId: completed.id, status: completed.status, publicUrl: link, attachedPdf: Boolean(attachment) };
    } catch (error) {
      const category = error instanceof ProposalEmailProviderError ? error.category : "unavailable";
      await this.repository.fail(claimed.id, "Не удалось передать письмо почтовому сервису.", category);
      console.error({ ...observation("proposal_delivery_failed", claimed, companyId), durationMs: Math.round(performance.now() - startedAt), providerResultCategory: category });
      throw new InvalidStateError("Письмо не отправлено. Доставка сохранена, повторите попытку позже.");
    }
  }

  async revoke(userId: string, deliveryId: string) {
    const companyId = await this.resolveCompany(userId);
    const result = await this.repository.revoke(normalizeId(deliveryId));
    if (result.companyId !== companyId) throw new NotFoundError("Доставка не найдена.");
    console.info(observation("proposal_link_revoked", result, companyId));
    return result;
  }

  async getPublic(rawToken: string): Promise<PublicProposalDto> {
    const tokenHash = hashValidatedToken(rawToken);
    const result = await this.repository.findPublic(tokenHash);
    if (!result || result.documentStatus !== "ready") throw new NotFoundError("Предложение недоступно.");
    return result;
  }

  async trackOpen(rawToken: string, context?: Pick<PublicProposalDto, "deliveryId" | "companyId" | "estimateId" | "versionId">): Promise<void> {
    try {
      await this.repository.trackOpen(hashValidatedToken(rawToken));
      console.info({ event: "proposal_link_opened", ...context, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    }
    catch (error) { console.error({ event: "proposal_link_open_tracking_failed", errorName: error instanceof Error ? error.name : typeof error }); }
  }

  async respond(rawToken: string, response: ProposalCustomerResponse, name?: string, note?: string) {
    const tokenHash = hashValidatedToken(rawToken);
    const result = await this.repository.respond({ tokenHash, response, name: normalizeOptional(name, 160), note: normalizeOptional(note, 2000) });
    console.info({ event: response === "accepted" ? "proposal_customer_accepted" : "proposal_customer_rejected", deliveryId: result.deliveryId, estimateId: result.estimateId, versionId: result.versionId, companyId: result.companyId, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    return result;
  }

  async download(rawToken: string) {
    const proposal = await this.getPublic(rawToken);
    return { bytes: await this.repository.downloadPublicDocument(proposal.documentId), filename: `${proposal.proposal.estimateNumber}.pdf` };
  }

  private async resolveCompany(userId: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, SEND_PERMISSION);
    return context.company.id;
  }
}

function buildEmail(preview: VersionProposalPreviewDto, locale: ProposalDeliveryLocale, link: string, expiresAt: string, recipientName: string | null, message: string | null, attachment?: { filename: string; content: Uint8Array }) {
  const copy = locale === "ro"
    ? { greeting: recipientName ? `Bună ziua, ${recipientName}.` : "Bună ziua.", intro: "Vă transmitem oferta comercială", action: "Deschideți oferta", validUntil: "Link valabil până la", customer: "Client/proiect", signature: "Cu respect" }
    : { greeting: recipientName ? `Здравствуйте, ${recipientName}.` : "Здравствуйте.", intro: "Направляем вам коммерческое предложение", action: "Открыть предложение", validUntil: "Ссылка действительна до", customer: "Клиент/проект", signature: "С уважением" };
  const reference = [preview.proposal.customerName, preview.proposal.projectName].filter(Boolean).join(" / ");
  const expiry = formatEmailDate(expiresAt, locale);
  const contacts = [preview.proposal.branding.contactName, preview.proposal.branding.phone, preview.proposal.branding.email].filter(Boolean).join(" · ");
  const lines = [copy.greeting, "", `${copy.intro} ${preview.proposal.estimateNumber}.`, reference ? `${copy.customer}: ${reference}` : "", message ?? "", "", `${copy.action}: ${link}`, `${copy.validUntil} ${expiry}.`, "", `${copy.signature},`, preview.proposal.branding.companyName, contacts].filter(Boolean);
  const text = lines.join("\n");
  const html = `<p>${escapeHtml(copy.greeting)}</p><p>${escapeHtml(copy.intro)} <strong>${escapeHtml(preview.proposal.estimateNumber)}</strong>.</p>${reference ? `<p>${escapeHtml(copy.customer)}: ${escapeHtml(reference)}</p>` : ""}${message ? `<p>${escapeHtml(message)}</p>` : ""}<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action)}</a></p><p>${escapeHtml(copy.validUntil)} ${escapeHtml(expiry)}.</p><p>${escapeHtml(copy.signature)},<br>${escapeHtml(preview.proposal.branding.companyName)}${contacts ? `<br>${escapeHtml(contacts)}` : ""}</p>`;
  return { text, html, attachment };
}

function publicUrl(token: string) { return `${publicOrigin()}/proposal/${token}`; }
function formatEmailDate(value: string, locale: ProposalDeliveryLocale) { return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value)); }
function publicOrigin() {
  const candidate = process.env.PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.nsd.md";
  const url = new URL(candidate);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new ProposalEmailProviderError("configuration");
  return url.origin;
}
function hashValidatedToken(value: string) { const token = value.trim(); if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) throw new NotFoundError("Предложение недоступно."); return hashToken(token); }
function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeEmail(value: string) { const email = value.trim().toLowerCase(); if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) throw new InvalidStateError("Укажите корректный email получателя."); return email; }
function normalizeHeader(value: string, max: number, message: string) { const normalized = value.trim(); if (!normalized || normalized.length > max || /[\r\n]/.test(normalized)) throw new InvalidStateError(message); return normalized; }
function normalizeOptional(value: string | undefined, max: number) { const normalized = value?.trim(); if (!normalized) return null; if (normalized.length > max) throw new InvalidStateError("Текст слишком длинный."); return normalized; }
function normalizeExpiration(value: number) { if (!Number.isInteger(value) || value < 1 || value > 30) throw new InvalidStateError("Срок ссылки должен быть от 1 до 30 дней."); return value; }
function normalizeLocale(value: ProposalDeliveryLocale): ProposalDeliveryLocale { if (value !== "ru" && value !== "ro") throw new InvalidStateError("Язык письма не поддерживается."); return value; }
function normalizeUuid(value: string) { const normalized = value.trim().toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) throw new InvalidStateError("Ключ отправки некорректен."); return normalized; }
function normalizeId(value: string) { const normalized = value.trim(); if (!normalized) throw new NotFoundError("Запись не найдена."); return normalized; }
function escapeHtml(value: string) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!); }
function observation(event: string, delivery: { id: string; estimateId: string; versionId: string; status: string }, companyId: string) { return { event, estimateId: delivery.estimateId, versionId: delivery.versionId, deliveryId: delivery.id, companyId, status: delivery.status, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null }; }
