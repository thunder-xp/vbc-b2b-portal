import "server-only";

export type SmtpSenderIdentity = {
  fromName: string;
  fromEmail: string;
};

export class EmailRuntimeConfigurationError extends Error {
  constructor() {
    super("Email runtime configuration is invalid.");
    this.name = "EmailRuntimeConfigurationError";
  }
}

export function getSmtpSenderIdentity(): SmtpSenderIdentity {
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim().toLowerCase();
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Novotech Partner";
  if (!fromEmail || fromEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)
      || fromName.length > 120 || /[\r\n]/.test(fromName)) {
    throw new EmailRuntimeConfigurationError();
  }
  return { fromName, fromEmail };
}

export function getCanonicalApplicationOrigin(): string {
  const candidate = process.env.PUBLIC_APP_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://www.nsd.md";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    return url.origin;
  } catch {
    throw new EmailRuntimeConfigurationError();
  }
}
