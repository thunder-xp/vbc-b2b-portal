import "server-only";

import { createHash } from "node:crypto";

import { Webhook } from "standardwebhooks";
import { z } from "zod";

import { getSupabaseServerEnv } from "@/src/lib/env";
import { SmtpEmailProvider, SmtpEmailProviderError } from "@/src/lib/email/smtp-email-provider";

const basicEmail = z.string().trim().min(3).max(254).refine(
  (value) => /^[^\s@]+@[^\s@]+$/.test(value),
  "Invalid email syntax",
);

const actionType = z.enum([
  "signup", "invite", "magiclink", "recovery", "email", "email_change", "reauthentication",
  "password_changed_notification", "email_changed_notification", "phone_changed_notification",
  "identity_linked_notification", "identity_unlinked_notification",
  "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification",
]);

const sendEmailPayloadSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: basicEmail,
    new_email: basicEmail.optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  email_data: z.object({
    token: z.string().max(2_048).default(""),
    token_hash: z.string().max(2_048).default(""),
    redirect_to: z.string().max(2_048).default(""),
    email_action_type: actionType,
    token_new: z.string().max(2_048).default(""),
    token_hash_new: z.string().max(2_048).default(""),
    old_email: z.string().max(254).default(""),
    old_phone: z.string().max(100).default(""),
    provider: z.string().max(100).default(""),
    factor_type: z.string().max(100).default(""),
  }).passthrough(),
}).passthrough();

type EmailActionType = z.infer<typeof actionType>;
type SendEmailPayload = z.infer<typeof sendEmailPayloadSchema>;

export class SendEmailHookError extends Error {
  constructor(readonly code: "SIGNATURE_INVALID" | "PAYLOAD_INVALID" | "CONFIGURATION_INVALID" | "DELIVERY_FAILED") {
    super("Send Email hook request rejected.");
    this.name = "SendEmailHookError";
  }
}

export async function handleSupabaseSendEmailHook(
  rawPayload: string,
  headers: Headers,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    provider?: Pick<SmtpEmailProvider, "send">;
    supabaseUrl?: string;
  }> = {},
): Promise<{ accepted: number; correlationId: string }> {
  const environment = options.environment ?? process.env;
  const secrets = readHookSecrets(environment.SUPABASE_SEND_EMAIL_HOOK_SECRET);
  if (secrets.length === 0) throw new SendEmailHookError("CONFIGURATION_INVALID");

  let verified: unknown = null;
  for (const secret of secrets) {
    try {
      verified = new Webhook(secret).verify(rawPayload, Object.fromEntries(headers));
      break;
    } catch {
      // Secret rotation is a bounded list.
    }
  }
  if (verified === null) throw new SendEmailHookError("SIGNATURE_INVALID");

  const parsed = sendEmailPayloadSchema.safeParse(verified);
  if (!parsed.success) throw new SendEmailHookError("PAYLOAD_INVALID");

  const webhookId = headers.get("webhook-id");
  if (!webhookId || webhookId.length > 200) throw new SendEmailHookError("SIGNATURE_INVALID");

  const supabaseUrl = options.supabaseUrl ?? readSupabaseUrl(environment);
  // Supabase gives HTTP email hooks a five-second end-to-end budget.
  const provider = options.provider ?? new SmtpEmailProvider({ timeoutMs: 2_500 });
  const messages = authEmailMessages(parsed.data, supabaseUrl, webhookId);
  try {
    for (const message of messages) await provider.send(message);
  } catch (error) {
    if (error instanceof SmtpEmailProviderError) throw new SendEmailHookError("DELIVERY_FAILED");
    throw new SendEmailHookError("DELIVERY_FAILED");
  }
  return { accepted: messages.length, correlationId: safeCorrelationId(webhookId) };
}

function authEmailMessages(payload: SendEmailPayload, supabaseUrl: string, webhookId: string) {
  const { user, email_data: email } = payload;
  const locale = user.user_metadata?.preferred_registration_locale === "ro" ? "ro" : "ru";
  if (isNotification(email.email_action_type)) {
    const oldEmail = email.old_email.trim().toLowerCase();
    const recipient = email.email_action_type === "email_changed_notification" && basicEmail.safeParse(oldEmail).success
      ? oldEmail
      : user.email;
    return [notificationMessage({
      to: recipient,
      action: email.email_action_type,
      locale,
      messageId: deterministicMessageId(webhookId, 0),
    })];
  }
  if (email.email_action_type !== "email_change") {
    if (!email.token_hash) throw new SendEmailHookError("PAYLOAD_INVALID");
    return [message({
      to: user.email,
      action: email.email_action_type,
      locale,
      token: email.token,
      link: verificationUrl(supabaseUrl, email.token_hash, email.email_action_type, email.redirect_to),
      messageId: deterministicMessageId(webhookId, 0),
    })];
  }

  if (!user.new_email) throw new SendEmailHookError("PAYLOAD_INVALID");
  const messages = [];
  if (email.token_hash_new && email.token) {
    messages.push(message({
      to: user.email,
      action: "email_change",
      locale,
      token: email.token,
      link: verificationUrl(supabaseUrl, email.token_hash_new, "email_change", email.redirect_to),
      messageId: deterministicMessageId(webhookId, messages.length),
    }));
  }
  const newEmailToken = email.token_new || email.token;
  if (email.token_hash && newEmailToken) {
    messages.push(message({
      to: user.new_email,
      action: "email_change",
      locale,
      token: newEmailToken,
      link: verificationUrl(supabaseUrl, email.token_hash, "email_change", email.redirect_to),
      messageId: deterministicMessageId(webhookId, messages.length),
    }));
  }
  if (messages.length === 0) throw new SendEmailHookError("PAYLOAD_INVALID");
  return messages;
}

function message(input: Readonly<{
  to: string;
  action: EmailActionType;
  locale: "ru" | "ro";
  token: string;
  link: string;
  messageId: string;
}>) {
  const copy = authEmailCopy(input.locale, input.action);
  const escapedLink = escapeHtml(input.link);
  const escapedToken = escapeHtml(input.token);
  return {
    to: input.to,
    subject: copy.subject,
    text: `${copy.intro}\n\n${input.link}\n\n${copy.code}: ${input.token}\n\n${copy.ignore}`,
    html: `<div style="font-family:Arial,sans-serif;color:#18181b;line-height:1.6"><h1 style="font-size:20px">${copy.heading}</h1><p>${copy.intro}</p><p><a href="${escapedLink}" style="display:inline-block;background:#047857;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">${copy.button}</a></p><p>${copy.code}: <strong>${escapedToken}</strong></p><p style="color:#52525b">${copy.ignore}</p></div>`,
    messageId: input.messageId,
  };
}

function notificationMessage(input: Readonly<{
  to: string;
  action: NotificationActionType;
  locale: "ru" | "ro";
  messageId: string;
}>) {
  const copy = authEmailCopy(input.locale, input.action);
  return {
    to: input.to,
    subject: copy.subject,
    text: `${copy.intro}\n\n${copy.ignore}`,
    html: `<div style="font-family:Arial,sans-serif;color:#18181b;line-height:1.6"><h1 style="font-size:20px">${copy.heading}</h1><p>${copy.intro}</p><p style="color:#52525b">${copy.ignore}</p></div>`,
    messageId: input.messageId,
  };
}

function authEmailCopy(locale: "ru" | "ro", action: EmailActionType) {
  const ru = locale === "ru";
  const labels: Record<EmailActionType, { ru: string; ro: string }> = {
    signup: { ru: "Подтвердите электронную почту", ro: "Confirmați adresa de e-mail" },
    invite: { ru: "Примите приглашение", ro: "Acceptați invitația" },
    magiclink: { ru: "Войдите в Novotech", ro: "Autentificați-vă în Novotech" },
    recovery: { ru: "Восстановите доступ", ro: "Restabiliți accesul" },
    email: { ru: "Подтвердите вход", ro: "Confirmați autentificarea" },
    email_change: { ru: "Подтвердите новую электронную почту", ro: "Confirmați noua adresă de e-mail" },
    reauthentication: { ru: "Подтвердите действие", ro: "Confirmați acțiunea" },
    password_changed_notification: { ru: "Пароль изменён", ro: "Parola a fost schimbată" },
    email_changed_notification: { ru: "Электронная почта изменена", ro: "Adresa de e-mail a fost schimbată" },
    phone_changed_notification: { ru: "Номер телефона изменён", ro: "Numărul de telefon a fost schimbat" },
    identity_linked_notification: { ru: "Способ входа добавлен", ro: "A fost adăugată o metodă de autentificare" },
    identity_unlinked_notification: { ru: "Способ входа удалён", ro: "A fost eliminată o metodă de autentificare" },
    mfa_factor_enrolled_notification: { ru: "Двухфакторная защита включена", ro: "Protecția cu doi factori a fost activată" },
    mfa_factor_unenrolled_notification: { ru: "Двухфакторная защита отключена", ro: "Protecția cu doi factori a fost dezactivată" },
  };
  const heading = labels[action][locale];
  return ru ? {
    subject: `${heading} — Novotech`,
    heading,
    intro: "Для продолжения используйте защищённую ссылку ниже.",
    button: "Продолжить",
    code: "Код подтверждения",
    ignore: "Если вы не запрашивали это письмо, проигнорируйте его.",
  } : {
    subject: `${heading} — Novotech`,
    heading,
    intro: "Pentru a continua, utilizați linkul securizat de mai jos.",
    button: "Continuă",
    code: "Cod de confirmare",
    ignore: "Dacă nu ați solicitat acest mesaj, îl puteți ignora.",
  };
}

type NotificationActionType = Extract<EmailActionType,
  | "password_changed_notification"
  | "email_changed_notification"
  | "phone_changed_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification"
>;

function isNotification(action: EmailActionType): action is NotificationActionType {
  return action.endsWith("_notification");
}

function verificationUrl(supabaseUrl: string, tokenHash: string, type: EmailActionType, redirectTo: string): string {
  let redirect: URL;
  try {
    redirect = new URL(redirectTo);
  } catch {
    throw new SendEmailHookError("PAYLOAD_INVALID");
  }
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") {
    throw new SendEmailHookError("PAYLOAD_INVALID");
  }
  const target = new URL("/auth/v1/verify", supabaseUrl);
  target.searchParams.set("token_hash", tokenHash);
  target.searchParams.set("type", type);
  target.searchParams.set("redirect_to", redirect.toString());
  return target.toString();
}

function readSupabaseUrl(environment: Readonly<Record<string, string | undefined>>): string {
  if (environment === process.env) return getSupabaseServerEnv().url;
  const value = environment.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new SendEmailHookError("CONFIGURATION_INVALID");
  try {
    return new URL(value).toString();
  } catch {
    throw new SendEmailHookError("CONFIGURATION_INVALID");
  }
}

function readHookSecrets(value: string | undefined): string[] {
  return (value ?? "")
    .split("|")
    .map((secret) => secret.trim().replace(/^v1,/, ""))
    .filter((secret) => /^whsec_[A-Za-z0-9+/=_-]{20,}$/.test(secret));
}

function deterministicMessageId(webhookId: string, index: number): string {
  const digest = createHash("sha256").update(`${webhookId}:${index}`).digest("hex");
  return `<supabase-auth-${digest}@nsd.md>`;
}

function safeCorrelationId(webhookId: string): string {
  return createHash("sha256").update(webhookId).digest("hex").slice(0, 24);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
