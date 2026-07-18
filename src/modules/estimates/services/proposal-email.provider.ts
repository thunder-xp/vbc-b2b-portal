import "server-only";

import nodemailer from "nodemailer";

export type ProposalEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachment?: { filename: string; content: Uint8Array };
};

export interface ProposalEmailProvider {
  send(message: ProposalEmailMessage): Promise<{ messageId: string | null; category: "accepted" }>;
}

export type ProposalEmailVerificationResult = {
  configured: boolean;
  connectionSuccessful: boolean;
  authenticationSuccessful: boolean;
  errorCategory: ProposalEmailProviderError["category"] | null;
  durationMs: number;
};

export class ProposalEmailProviderError extends Error {
  constructor(readonly category: "configuration" | "timeout" | "authentication" | "rejected" | "unavailable") {
    super("Proposal email provider failed.");
    this.name = "ProposalEmailProviderError";
  }
}

export class SmtpProposalEmailProvider implements ProposalEmailProvider {
  async verify(): Promise<ProposalEmailVerificationResult> {
    const startedAt = performance.now();
    let config: ReturnType<typeof smtpConfig>;
    try {
      config = smtpConfig();
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

  async send(message: ProposalEmailMessage) {
    const config = smtpConfig();
    const transporter = createSmtpTransport(config);
    try {
      const result = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromEmail }, to: message.to,
        subject: message.subject, text: message.text, html: message.html,
        attachments: message.attachment ? [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content), contentType: "application/pdf" }] : undefined,
      });
      return { messageId: typeof result.messageId === "string" ? result.messageId.slice(0, 300) : null, category: "accepted" as const };
    } catch (error) {
      throw new ProposalEmailProviderError(categoryOf(error));
    } finally {
      transporter.close();
    }
  }
}

export function verifySmtpTransport(): Promise<ProposalEmailVerificationResult> {
  return new SmtpProposalEmailProvider().verify();
}

function createSmtpTransport(config: ReturnType<typeof smtpConfig>) {
  return nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: config.timeoutMs, greetingTimeout: config.timeoutMs, socketTimeout: config.timeoutMs,
  });
}

function categoryOf(error: unknown): ProposalEmailProviderError["category"] {
  if (error instanceof ProposalEmailProviderError) return error.category;
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
  errorCategory: ProposalEmailVerificationResult["errorCategory"],
  startedAt: number,
): ProposalEmailVerificationResult {
  return { configured, connectionSuccessful, authenticationSuccessful, errorCategory, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
}

function smtpConfig() {
  const required = (name: "SMTP_HOST" | "SMTP_USER" | "SMTP_PASSWORD" | "SMTP_FROM_EMAIL") => {
    const value = process.env[name]?.trim();
    if (!value) throw new ProposalEmailProviderError("configuration");
    return value;
  };
  const port = Number(process.env.SMTP_PORT ?? "587");
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new ProposalEmailProviderError("configuration");
  }
  return {
    host: required("SMTP_HOST"), user: required("SMTP_USER"), password: required("SMTP_PASSWORD"),
    fromEmail: required("SMTP_FROM_EMAIL"), fromName: process.env.SMTP_FROM_NAME?.trim() || "Novotech Partner",
    port, timeoutMs, secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  };
}
