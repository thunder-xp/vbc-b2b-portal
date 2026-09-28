import "server-only";

import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { z } from "zod";

import { getCanonicalApplicationOrigin } from "@/src/lib/email/runtime-email-config";
import { ProposalEmailProviderError, SmtpProposalEmailProvider } from "@/src/modules/estimates/services/proposal-email.provider";

const actionTypes = [
  "signup", "invite", "magiclink", "recovery", "email_change", "email", "reauthentication",
  "password_changed_notification", "email_changed_notification", "phone_changed_notification",
  "identity_linked_notification", "identity_unlinked_notification", "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
] as const;

const tokenHash = z.string().max(128).regex(/^[A-Za-z0-9_-]{16,128}$/).or(z.literal(""));
const actionPayloadSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email().max(254),
    new_email: z.string().email().max(254).optional(),
    user_metadata: z.object({
      preferred_registration_locale: z.enum(["ru", "ro"]).optional(),
      registration_intent: z.enum(["agent", "installer"]).optional(),
    }).passthrough().optional(),
  }).passthrough(),
  email_data: z.object({
    token: z.string().max(128),
    token_hash: tokenHash,
    token_new: z.string().max(128),
    token_hash_new: tokenHash,
    redirect_to: z.string().max(2048),
    email_action_type: z.enum(actionTypes),
    site_url: z.string().max(2048).optional(),
    new_email: z.string().email().max(254).optional(),
  }).passthrough(),
}).passthrough();

type EmailActionType = typeof actionTypes[number];
type NotificationActionType = Extract<EmailActionType,
  | "password_changed_notification" | "email_changed_notification" | "phone_changed_notification"
  | "identity_linked_notification" | "identity_unlinked_notification"
  | "mfa_factor_enrolled_notification" | "mfa_factor_unenrolled_notification">;
type Locale = "ru" | "ro";
type Delivery = Readonly<{ to: string; subject: string; title: string; body: string; button: string | null; link: string | null }>;

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const MAX_REPORTED_TIMESTAMP_SKEW_SECONDS = 24 * 60 * 60;
const MAX_REPORTED_SIGNATURE_ENTRIES = 8;
const MAX_SIGNATURE_HEADER_INSPECTION_CHARS = 4_096;

export type SignatureVerificationFailureCategory =
  | "MISSING_HEADERS"
  | "INVALID_TIMESTAMP"
  | "TIMESTAMP_TOO_OLD"
  | "TIMESTAMP_TOO_NEW"
  | "NO_MATCHING_SIGNATURE"
  | "MALFORMED_SIGNATURE"
  | "UNKNOWN_SIGNATURE_FAILURE";

export type SignatureVerificationDiagnostics = Readonly<{
  webhookIdPresent: boolean;
  webhookTimestampPresent: boolean;
  webhookSignaturePresent: boolean;
  webhookIdShapeValid: boolean;
  timestampParseValid: boolean;
  timestampSkewSeconds: number | null;
  signatureEntryCount: number;
  signatureVersionShapeValid: boolean;
  configuredSecretCount: number;
  verificationFailureCategory: SignatureVerificationFailureCategory;
}>;

export class SendEmailHookError extends Error {
  constructor(
    readonly code: "SIGNATURE_INVALID" | "PAYLOAD_INVALID" | "CONFIGURATION_INVALID" | "DELIVERY_UNAVAILABLE" | "DELIVERY_CONFIGURATION_INVALID",
    readonly signatureDiagnostics?: SignatureVerificationDiagnostics,
  ) {
    super("Send Email hook request rejected.");
    this.name = "SendEmailHookError";
  }
}

export async function handleSupabaseSendEmailHook(
  rawPayload: string,
  headers: Headers,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    provider?: Pick<SmtpProposalEmailProvider, "send">;
    correlationId: string;
    startedAt?: number;
  }>,
) {
  const startedAt = options.startedAt ?? performance.now();
  const environment = options.environment ?? process.env;
  const secrets = readHookSecrets(environment.SUPABASE_SEND_EMAIL_HOOK_SECRET);
  if (secrets.length === 0) throw new SendEmailHookError("CONFIGURATION_INVALID");

  const diagnosticInput = inspectSignatureInput(headers, secrets.length);
  const structuralFailure = classifyStructuralFailure(diagnosticInput);
  if (structuralFailure) {
    throw new SendEmailHookError("SIGNATURE_INVALID", createSignatureDiagnostics(diagnosticInput, structuralFailure));
  }

  let verified: unknown = null;
  const verificationFailures: unknown[] = [];
  for (const secret of secrets) {
    try {
      verified = new Webhook(secret).verify(rawPayload, Object.fromEntries(headers));
      break;
    } catch (error) {
      verificationFailures.push(error);
      // Rotation is limited to the active and immediately previous key.
    }
  }
  if (verified === null) {
    const verificationFailureCategory = verificationFailures.length > 0
      && verificationFailures.every((error) => error instanceof WebhookVerificationError && error.message === "No matching signature found")
      ? "NO_MATCHING_SIGNATURE"
      : "UNKNOWN_SIGNATURE_FAILURE";
    throw new SendEmailHookError("SIGNATURE_INVALID", createSignatureDiagnostics(diagnosticInput, verificationFailureCategory));
  }

  const parsed = actionPayloadSchema.safeParse(verified);
  const webhookId = headers.get("webhook-id");
  if (!parsed.success || !webhookId || webhookId.length > 200) {
    throw new SendEmailHookError("PAYLOAD_INVALID");
  }

  const { user, email_data: emailData } = parsed.data;
  const locale = user.user_metadata?.preferred_registration_locale ?? "ru";
  const deliveries = createDeliveries(user, emailData.email_action_type, emailData.token_hash,
    emailData.token_hash_new, emailData.token, emailData.token_new, emailData.redirect_to,
    emailData.new_email ?? user.new_email, locale, environment);
  const provider = options.provider ?? new SmtpProposalEmailProvider();

  try {
    const results = await Promise.allSettled(deliveries.map(async (delivery) => {
      const html = renderEmail(delivery, locale);
      return provider.send({
        to: delivery.to,
        subject: delivery.subject,
        text: renderText(delivery),
        html,
        timeoutMs: 4_000,
      });
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  } catch (error) {
    if (error instanceof ProposalEmailProviderError
      && ["configuration", "authentication", "rejected"].includes(error.category)) {
      throw new SendEmailHookError("DELIVERY_CONFIGURATION_INVALID");
    }
    throw new SendEmailHookError("DELIVERY_UNAVAILABLE");
  }

  return { correlationId: options.correlationId, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
}

function createDeliveries(
  user: z.infer<typeof actionPayloadSchema>["user"],
  type: EmailActionType,
  hash: string,
  hashNew: string,
  token: string,
  tokenNew: string,
  redirectTo: string,
  newEmail: string | undefined,
  locale: Locale,
  environment: Readonly<Record<string, string | undefined>>,
): Delivery[] {
  if (isNotification(type)) return [notificationDelivery(user.email, locale)];

  const redirect = safeRedirect(redirectTo, environment);
  if (!redirect) throw new SendEmailHookError("PAYLOAD_INVALID");
  const supabaseUrl = readSupabaseAuthOrigin(environment);

  if (type === "email_change") {
    const messages: Delivery[] = [];
    if (hashNew && token && user.email) {
      messages.push(linkDelivery(user.email, "email_change", hashNew, redirect, supabaseUrl, locale));
    }
    if (hash && (tokenNew || token) && newEmail) {
      messages.push(linkDelivery(newEmail, "email_change", hash, redirect, supabaseUrl, locale));
    }
    if (messages.length === 0 || (hash && !newEmail)) throw new SendEmailHookError("PAYLOAD_INVALID");
    return messages;
  }

  if (!hash) throw new SendEmailHookError("PAYLOAD_INVALID");
  return [linkDelivery(user.email, type, hash, redirect, supabaseUrl, locale)];
}

function linkDelivery(to: string, type: Exclude<EmailActionType, "password_changed_notification" | "email_changed_notification" | "phone_changed_notification" | "identity_linked_notification" | "identity_unlinked_notification" | "mfa_factor_enrolled_notification" | "mfa_factor_unenrolled_notification">, hash: string, redirect: URL, authOrigin: URL, locale: Locale): Delivery {
  const confirmation = new URL("/auth/v1/verify", authOrigin);
  confirmation.searchParams.set("token", hash);
  confirmation.searchParams.set("type", type);
  confirmation.searchParams.set("redirect_to", redirect.toString());
  const copy = type === "signup" ? locale === "ro" ? ["\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0061\u0064\u0072\u0065\u0073\u0061\u0020\u0064\u0065\u0020\u0065\u002d\u006d\u0061\u0069\u006c\u0020\u2014\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0061\u0064\u0072\u0065\u0073\u0061\u0020\u0064\u0065\u0020\u0065\u002d\u006d\u0061\u0069\u006c", "\u0050\u0065\u006e\u0074\u0072\u0075\u0020\u0061\u0020\u0063\u006f\u006e\u0074\u0069\u006e\u0075\u0061\u0020\u00ee\u006e\u0072\u0065\u0067\u0069\u0073\u0074\u0072\u0061\u0072\u0065\u0061\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002c\u0020\u0063\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0061\u0064\u0072\u0065\u0073\u0061\u0020\u0064\u0065\u0020\u0065\u002d\u006d\u0061\u0069\u006c\u002e", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0103\u0020\u0061\u0064\u0072\u0065\u0073\u0061"]
    : ["\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u043f\u043e\u0447\u0442\u0443\u0020\u2014\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u0430\u0434\u0440\u0435\u0441\u0020\u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439\u0020\u043f\u043e\u0447\u0442\u044b", "\u0427\u0442\u043e\u0431\u044b\u0020\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c\u0020\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e\u0020\u0432\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002c\u0020\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u0430\u0434\u0440\u0435\u0441\u0020\u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439\u0020\u043f\u043e\u0447\u0442\u044b\u002e", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c\u0020\u043f\u043e\u0447\u0442\u0443"]
    : type === "invite" ? locale === "ro" ? ["\u0049\u006e\u0076\u0069\u0074\u0061\u021b\u0069\u0065\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0069\u006e\u0076\u0069\u0074\u0061\u021b\u0069\u0061\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0069\u006e\u0076\u0069\u0074\u0061\u021b\u0069\u0061\u0020\u0070\u0065\u006e\u0074\u0072\u0075\u0020\u0061\u0020\u0063\u006f\u006e\u0074\u0069\u006e\u0075\u0061\u002e", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0103\u0020\u0069\u006e\u0076\u0069\u0074\u0061\u021b\u0069\u0061"]
      : ["\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435\u002c\u0020\u0447\u0442\u043e\u0431\u044b\u0020\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c\u002e", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c\u0020\u043f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435"]
      : type === "recovery" ? locale === "ro" ? ["\u0052\u0065\u0073\u0065\u0074\u0061\u0072\u0065\u0061\u0020\u0070\u0061\u0072\u006f\u006c\u0065\u0069\u0020\u2014\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0052\u0065\u0073\u0065\u0074\u0061\u021b\u0069\u0020\u0070\u0061\u0072\u006f\u006c\u0061", "\u0046\u006f\u006c\u006f\u0073\u0069\u021b\u0069\u0020\u0062\u0075\u0074\u006f\u006e\u0075\u006c\u0020\u0070\u0065\u006e\u0074\u0072\u0075\u0020\u0061\u0020\u0063\u006f\u006e\u0074\u0069\u006e\u0075\u0061\u0020\u0072\u0065\u0073\u0065\u0074\u0061\u0072\u0065\u0061\u0020\u0070\u0061\u0072\u006f\u006c\u0065\u0069\u002e", "\u0052\u0065\u0073\u0065\u0074\u0065\u0061\u007a\u0103\u0020\u0070\u0061\u0072\u006f\u006c\u0061"]
        : ["\u0421\u0431\u0440\u043e\u0441\u0020\u043f\u0430\u0440\u043e\u043b\u044f\u0020\u2014\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0421\u0431\u0440\u043e\u0441\u044c\u0442\u0435\u0020\u043f\u0430\u0440\u043e\u043b\u044c", "\u041d\u0430\u0436\u043c\u0438\u0442\u0435\u0020\u043a\u043d\u043e\u043f\u043a\u0443\u002c\u0020\u0447\u0442\u043e\u0431\u044b\u0020\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c\u0020\u0441\u0431\u0440\u043e\u0441\u0020\u043f\u0430\u0440\u043e\u043b\u044f\u002e", "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c\u0020\u043f\u0430\u0440\u043e\u043b\u044c"]
        : locale === "ro" ? ["\u0043\u006f\u006e\u0065\u0063\u0074\u0061\u0072\u0065\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0043\u006f\u006e\u0066\u0069\u0072\u006d\u0061\u021b\u0069\u0020\u0073\u006f\u006c\u0069\u0063\u0069\u0074\u0061\u0072\u0065\u0061", "\u0046\u006f\u006c\u006f\u0073\u0069\u021b\u0069\u0020\u0062\u0075\u0074\u006f\u006e\u0075\u006c\u0020\u0070\u0065\u006e\u0074\u0072\u0075\u0020\u0061\u0020\u0063\u006f\u006e\u0074\u0069\u006e\u0075\u0061\u002e", "\u0043\u006f\u006e\u0074\u0069\u006e\u0075\u0103"]
          : ["\u0412\u0445\u043e\u0434\u0020\u0432\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435\u0020\u0437\u0430\u043f\u0440\u043e\u0441", "\u041d\u0430\u0436\u043c\u0438\u0442\u0435\u0020\u043a\u043d\u043e\u043f\u043a\u0443\u002c\u0020\u0447\u0442\u043e\u0431\u044b\u0020\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c\u002e", "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c"];
  return { to, subject: copy[0], title: copy[1], body: copy[2], button: copy[3], link: confirmation.toString() };
}

function notificationDelivery(to: string, locale: Locale): Delivery {
  const copy: readonly [string, string, string] = locale === "ro"
    ? ["\u0053\u0065\u0063\u0075\u0072\u0069\u0074\u0061\u0074\u0065\u0061\u0020\u0063\u006f\u006e\u0074\u0075\u006c\u0075\u0069\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0053\u0065\u0074\u0103\u0072\u0069\u006c\u0065\u0020\u0064\u0065\u0020\u0073\u0065\u0063\u0075\u0072\u0069\u0074\u0061\u0074\u0065\u0020\u0061\u0075\u0020\u0066\u006f\u0073\u0074\u0020\u0073\u0063\u0068\u0069\u006d\u0062\u0061\u0074\u0065", "\u0044\u0061\u0063\u0103\u0020\u006e\u0075\u0020\u0061\u021b\u0069\u0020\u0073\u006f\u006c\u0069\u0063\u0069\u0074\u0061\u0074\u0020\u0061\u0063\u0065\u0061\u0073\u0074\u0103\u0020\u0073\u0063\u0068\u0069\u006d\u0062\u0061\u0072\u0065\u002c\u0020\u0063\u006f\u006e\u0074\u0061\u0063\u0074\u0061\u021b\u0069\u0020\u0065\u0063\u0068\u0069\u0070\u0061\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002e"]
    : ["\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c\u0020\u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068", "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u044b\u0020\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438\u0020\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u0438\u0020\u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430", "\u0415\u0441\u043b\u0438\u0020\u0432\u044b\u0020\u043d\u0435\u0020\u0437\u0430\u043f\u0440\u0430\u0448\u0438\u0432\u0430\u043b\u0438\u0020\u044d\u0442\u043e\u0020\u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435\u002c\u0020\u0441\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c\u0020\u0441\u0020\u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002e"];
  const [subject, title, body] = copy;
  return { to, subject, title, body, button: null, link: null };
}

function isNotification(type: EmailActionType): type is NotificationActionType {
  return type.endsWith("_notification");
}

function safeRedirect(value: string, environment: Readonly<Record<string, string | undefined>>): URL | null {
  try {
    const target = new URL(value);
    const canonicalOrigin = getCanonicalApplicationOrigin();
    const allowed = new Set([canonicalOrigin, "https://nsd.md", "https://www.nsd.md"]);
    if (environment.NODE_ENV !== "production") {
      allowed.add("http://localhost:3000");
      allowed.add("http://127.0.0.1:3000");
    }
    return target.protocol === "https:" || environment.NODE_ENV !== "production" && target.protocol === "http:"
      ? allowed.has(target.origin) ? target : null
      : null;
  } catch {
    return null;
  }
}

function readSupabaseAuthOrigin(environment: Readonly<Record<string, string | undefined>>): URL {
  try {
    const value = environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL;
    if (!value || value.length > 512) throw new Error();
    const url = new URL(value);
    if (url.protocol !== "https:" && !(environment.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error();
    return new URL(url.origin);
  } catch {
    throw new SendEmailHookError("CONFIGURATION_INVALID");
  }
}

function renderEmail(message: Delivery, locale: Locale): string {
  const title = escapeHtml(message.title);
  const body = escapeHtml(message.body);
  const button = message.button && message.link
    ? `<p><a href="${escapeHtml(message.link)}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(message.button)}</a></p>`
    : "";
  const footer = locale === "ro" ? "\u0041\u0063\u0065\u0073\u0074\u0020\u006d\u0065\u0073\u0061\u006a\u0020\u0061\u0020\u0066\u006f\u0073\u0074\u0020\u0074\u0072\u0069\u006d\u0069\u0073\u0020\u0061\u0075\u0074\u006f\u006d\u0061\u0074\u0020\u0064\u0065\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002e" : "\u042d\u0442\u043e\u0020\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0435\u0020\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u0020\u004e\u006f\u0076\u006f\u0074\u0065\u0063\u0068\u002e";
  return `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,sans-serif;color:#27272a"><main style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border-radius:8px"><p style="font-size:12px;color:#71717a">Novotech</p><h1 style="font-size:22px">${title}</h1><p style="line-height:1.6">${body}</p>${button}<p style="font-size:12px;color:#71717a">${escapeHtml(footer)}</p></main></body></html>`;
}

function renderText(message: Delivery): string {
  return [message.title, message.body, message.link && message.button ? `${message.button}: ${message.link}` : null, "Novotech"]
    .filter(Boolean).join("\n\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function readHookSecrets(value: string | undefined): string[] {
  if (!value || value.length > 512) return [];
  const secrets = value.split("|").map((secret) => secret.trim().replace(/^v1,/, ""));
  if (secrets.length > 2) return [];
  return secrets.filter((secret) => /^whsec_[A-Za-z0-9+/=_-]{20,128}$/.test(secret));
}

type SignatureDiagnosticInput = Omit<SignatureVerificationDiagnostics, "verificationFailureCategory"> & Readonly<{
  requiredHeaderValuesPresent: boolean;
  rawTimestampSkewSeconds: number | null;
}>;

function inspectSignatureInput(headers: Headers, configuredSecretCount: number): SignatureDiagnosticInput {
  const webhookId = headers.get("webhook-id");
  const timestampHeader = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  const webhookIdPresent = webhookId !== null;
  const webhookTimestampPresent = timestampHeader !== null;
  const webhookSignaturePresent = signatureHeader !== null;
  const timestamp = parseWebhookTimestamp(timestampHeader);
  const rawTimestampSkewSeconds = timestamp === null ? null : Math.floor(Date.now() / 1_000) - timestamp;
  const signature = inspectSignatureShape(signatureHeader);

  return {
    webhookIdPresent,
    webhookTimestampPresent,
    webhookSignaturePresent,
    webhookIdShapeValid: webhookId !== null && /^[A-Za-z0-9_-]{1,200}$/.test(webhookId),
    timestampParseValid: timestamp !== null,
    timestampSkewSeconds: rawTimestampSkewSeconds === null
      ? null
      : Math.max(-MAX_REPORTED_TIMESTAMP_SKEW_SECONDS, Math.min(MAX_REPORTED_TIMESTAMP_SKEW_SECONDS, rawTimestampSkewSeconds)),
    signatureEntryCount: signature.entryCount,
    signatureVersionShapeValid: signature.shapeValid,
    configuredSecretCount,
    requiredHeaderValuesPresent: Boolean(webhookId && timestampHeader && signatureHeader),
    rawTimestampSkewSeconds,
  };
}

function parseWebhookTimestamp(value: string | null): number | null {
  if (!value || !/^\d{1,16}$/.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function inspectSignatureShape(value: string | null): Readonly<{ entryCount: number; shapeValid: boolean }> {
  if (!value) return { entryCount: 0, shapeValid: false };
  if (value.length > MAX_SIGNATURE_HEADER_INSPECTION_CHARS) {
    return { entryCount: MAX_REPORTED_SIGNATURE_ENTRIES, shapeValid: false };
  }
  const rawEntries = value.trim().split(/\s+/).filter(Boolean);
  const entryCount = Math.min(rawEntries.length, MAX_REPORTED_SIGNATURE_ENTRIES);
  if (rawEntries.length === 0 || rawEntries.length > MAX_REPORTED_SIGNATURE_ENTRIES) {
    return { entryCount, shapeValid: false };
  }
  const entries = rawEntries.map((entry, index) => index < rawEntries.length - 1 && entry.endsWith(",")
    ? entry.slice(0, -1)
    : entry);
  return {
    entryCount,
    shapeValid: entries.every((entry) => /^v1,[A-Za-z0-9+/]{43}=$/.test(entry)),
  };
}

function classifyStructuralFailure(input: SignatureDiagnosticInput): SignatureVerificationFailureCategory | null {
  if (!input.requiredHeaderValuesPresent) return "MISSING_HEADERS";
  if (!input.timestampParseValid || input.rawTimestampSkewSeconds === null) return "INVALID_TIMESTAMP";
  if (input.rawTimestampSkewSeconds > WEBHOOK_TOLERANCE_SECONDS) return "TIMESTAMP_TOO_OLD";
  if (input.rawTimestampSkewSeconds < -WEBHOOK_TOLERANCE_SECONDS) return "TIMESTAMP_TOO_NEW";
  if (!input.signatureVersionShapeValid) return "MALFORMED_SIGNATURE";
  return null;
}

function createSignatureDiagnostics(
  input: SignatureDiagnosticInput,
  verificationFailureCategory: SignatureVerificationFailureCategory,
): SignatureVerificationDiagnostics {
  return {
    webhookIdPresent: input.webhookIdPresent,
    webhookTimestampPresent: input.webhookTimestampPresent,
    webhookSignaturePresent: input.webhookSignaturePresent,
    webhookIdShapeValid: input.webhookIdShapeValid,
    timestampParseValid: input.timestampParseValid,
    timestampSkewSeconds: input.timestampSkewSeconds,
    signatureEntryCount: input.signatureEntryCount,
    signatureVersionShapeValid: input.signatureVersionShapeValid,
    configuredSecretCount: input.configuredSecretCount,
    verificationFailureCategory,
  };
}
