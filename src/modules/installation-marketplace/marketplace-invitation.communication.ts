import "server-only";

import { getCanonicalApplicationOrigin } from "@/src/lib/email/runtime-email-config";
import { CommunicationGatewayService } from "@/src/modules/notifications/gateway/communication-gateway.service";
import type { CommunicationIntent, CommunicationLocale } from "@/src/modules/notifications/gateway/communication-intent";
import { CommunicationTemplateRegistry } from "@/src/modules/notifications/gateway/communication-template.registry";
import { DurableCommunicationService } from "@/src/modules/notifications/gateway/durable-communication.service";
import { SupabaseDurableCommunicationRepository } from "@/src/modules/notifications/gateway/supabase-durable-communication.repository";
import type { InstallationMarketplaceInvitationSend } from "./types";

const TEMPLATE_KEY = "installation_marketplace_invitation";
const TEMPLATE_VERSION = "v1";

export async function persistInstallationMarketplaceInvitationEmail(
  invitation: InstallationMarketplaceInvitationSend,
  correlationId: string,
) {
  if (!invitation.channels.includes("EMAIL") || !invitation.emailIntentId || !invitation.recipientEmail) return null;
  const locale = invitation.recipientLocale;
  const target = `${getCanonicalApplicationOrigin()}/cabinet/installation-marketplace`;
  const intent: CommunicationIntent<{ companyName: string }> = Object.freeze({
    intentId: invitation.emailIntentId,
    purpose: "TRANSACTIONAL",
    businessEventType: "marketplace.invitation",
    businessEntityReferences: Object.freeze([invitation.invitationId, invitation.companyId]),
    companyId: invitation.companyId,
    recipient: Object.freeze({
      userId: invitation.recipientUserId,
      companyId: invitation.companyId,
      locale,
      email: invitation.recipientEmail,
      identityVerified: invitation.identityVerified,
      membershipActive: true,
      capabilityAuthorized: true,
    }),
    templateKey: TEMPLATE_KEY,
    templateVersion: TEMPLATE_VERSION,
    channelPolicy: Object.freeze({ email: "LIVE", in_app: "DISABLED", sms: "DISABLED" }),
    variables: Object.freeze({ companyName: invitation.companyName }),
    cta: Object.freeze({ label: locale === "ro" ? "Deschide montaj și solicitări" : "Открыть монтаж и заявки", target }),
    priority: "normal",
    scheduledBusinessDate: new Date().toISOString().slice(0, 10),
    correlationId,
    idempotencyIdentity: invitation.emailIntentId,
    sensitivity: "PARTNER_PRIVATE",
  });
  const gateway = new CommunicationGatewayService(invitationTemplates());
  return new DurableCommunicationService(gateway, new SupabaseDurableCommunicationRepository()).persist(intent, ["email"]);
}

function invitationTemplates() {
  const registry = new CommunicationTemplateRegistry();
  for (const locale of ["ru", "ro"] as const) {
    registry.register({ templateKey: TEMPLATE_KEY, templateVersion: TEMPLATE_VERSION, locale, channel: "email", render: (intent) => renderInvitation(intent, locale) });
  }
  return registry;
}

function renderInvitation(intent: CommunicationIntent, locale: CommunicationLocale) {
  const companyName = String(intent.variables.companyName ?? "").slice(0, 160);
  const ru = locale === "ru";
  const subject = ru ? "Приглашение в сеть монтажников Novotech" : "Invitație în rețeaua de instalatori Novotech";
  const paragraphs = ru
    ? [
      `${companyName}, Novotech приглашает вашу компанию подключиться к разделу «Монтаж и заявки».`,
      "Вы самостоятельно выбираете компетенции, регионы обслуживания и текущую доступность.",
      "Участие добровольное. Публичный профиль и подтверждённые отзывы помогают клиентам принимать решение, но объём заявок не гарантируется.",
    ]
    : [
      `${companyName}, Novotech invită compania dvs. să se conecteze la secțiunea „Montaj și solicitări”.`,
      "Alegeți independent competențele, zonele de deservire și disponibilitatea curentă.",
      "Participarea este voluntară. Profilul public și recenziile verificate ajută clienții să decidă, dar volumul solicitărilor nu este garantat.",
    ];
  const cta = `${intent.cta.label}: ${intent.cta.target}`;
  return Object.freeze({
    subject,
    textBody: [...paragraphs, cta].join("\n\n"),
    htmlBody: `${paragraphs.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<p><a href="${escapeHtml(intent.cta.target)}">${escapeHtml(intent.cta.label)}</a></p>`,
    providerPayload: Object.freeze({}),
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}
