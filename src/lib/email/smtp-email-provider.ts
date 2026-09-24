import "server-only";

import nodemailer from "nodemailer";

import { externalEmailBlockReason } from "./external-email-safety";
import { getSmtpSenderIdentity } from "./runtime-email-config";

export type SmtpEmailErrorCategory = "configuration" | "timeout" | "authentication" | "rejected" | "unavailable";

export type SmtpEmailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  attachment?: Readonly<{ filename: string; content: Uint8Array; contentType?: string }>;
}>;

export type SmtpVerificationResult = Readonly<{
  configured: boolean;
  connectionSuccessful: boolean;
  authenticationSuccessful: boolean;
  errorCategory: SmtpEmailErrorCategory | null;
  durationMs: number;
}>;

export class SmtpEmailProviderError extends Error {
  constructor(readonly category: SmtpEmailErrorCategory) {
    super("SMTP email provider failed.");
    this.name = "SmtpEmailProviderError";
  }
}

export class SmtpEmailProvider {
  constructor(private readonly options: Readonly<{ timeoutMs?: number }> = {}) {}

  async verify(): Promise<SmtpVerificationResult> {
    const startedAt = performance.now();
    let config: ReturnType<typeof smtpConfig>;
    try {
      config = smtpConfig(this.options.timeoutMs);
    } catch (error) {
      return verificationResult(false, false, false, categoryOf(error), startedAt);
    }

    const transporter = createSmtpTransport(config);
    try {
      await transporter.verify();
      return verificationResult(true, true, true, null, startedAt);
    } catch (error) {
      const category = categoryOf(error);
      return verificationResult(true, category === "authentication", false, category, startedAt);
    } finally {
      transporter.close();
    }
  }

  async send(message: SmtpEmailMessage): Promise<{ messageId: string | null; category: "accepted" }> {
    if (externalEmailBlockReason()) throw new SmtpEmailProviderError("configuration");
    const config = smtpConfig(this.options.timeoutMs);
    const transporter = createSmtpTransport(config);
    try {
      const result = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromEmail },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
        attachments: message.attachment ? [{
          filename: message.attachment.filename,
          content: Buffer.from(message.attachment.content),
          contentType: message.attachment.contentType ?? "application/pdf",
        }] : undefined,
      });
      return {
        messageId: typeof result.messageId === "string" ? result.messageId.slice(0, 300) : null,
        category: "accepted",
      };
    } catch (error) {
      throw new SmtpEmailProviderError(categoryOf(error));
    } finally {
      transporter.close();
    }
  }
}

export function isSmtpEmailConfigured(): boolean {
  try {
    smtpConfig();
    return true;
  } catch {
    return false;
  }
}

function createSmtpTransport(config: ReturnType<typeof smtpConfig>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
}

function categoryOf(error: unknown): SmtpEmailErrorCategory {
  if (error instanceof SmtpEmailProviderError) return error.category;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (/TIMEOUT|ETIMEDOUT/i.test(code)) return "timeout";
  if (/AUTH|EAUTH/i.test(code)) return "authentication";
  if (/EENVELOPE|EMESSAGE/i.test(code)) return "rejected";
  return "unavailable";
}

function verificationResult(
  configured: boolean,
  connectionSuccessful: boolean,
  authenticationSuccessful: boolean,
  errorCategory: SmtpEmailErrorCategory | null,
  startedAt: number,
): SmtpVerificationResult {
  return {
    configured,
    connectionSuccessful,
    authenticationSuccessful,
    errorCategory,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

function smtpConfig(timeoutOverride?: number) {
  const required = (name: "SMTP_HOST" | "SMTP_USER" | "SMTP_PASSWORD") => {
    const value = process.env[name]?.trim();
    if (!value) throw new SmtpEmailProviderError("configuration");
    return value;
  };
  const port = Number(process.env.SMTP_PORT ?? "587");
  const timeoutMs = timeoutOverride ?? Number(process.env.SMTP_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new SmtpEmailProviderError("configuration");
  }
  let sender: ReturnType<typeof getSmtpSenderIdentity>;
  try {
    sender = getSmtpSenderIdentity();
  } catch {
    throw new SmtpEmailProviderError("configuration");
  }
  return {
    host: required("SMTP_HOST"),
    user: required("SMTP_USER"),
    password: required("SMTP_PASSWORD"),
    ...sender,
    port,
    timeoutMs,
    secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  };
}
