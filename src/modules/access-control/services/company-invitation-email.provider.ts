import "server-only";

import nodemailer from "nodemailer";

export type CompanyInvitationEmail = {
  to: string;
  employeeName: string;
  companyName: string;
  inviterName: string;
  roleLabel: string;
  invitationUrl: string;
  expiresAt: string;
};

export interface CompanyInvitationEmailProvider {
  send(message: CompanyInvitationEmail): Promise<void>;
}

export class SmtpCompanyInvitationEmailProvider
  implements CompanyInvitationEmailProvider
{
  async send(message: CompanyInvitationEmail): Promise<void> {
    const config = smtpConfig();
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
    });
    const subject = `Доступ к компании ${message.companyName}`;
    const text = [
      `Здравствуйте, ${message.employeeName}.`,
      `${message.inviterName} приглашает вас в кабинет компании ${message.companyName}.`,
      `Роль: ${message.roleLabel}`,
      `Откройте защищённую ссылку до ${formatDate(message.expiresAt)}:`,
      message.invitationUrl,
      "Если вы не ожидали приглашение, проигнорируйте это письмо.",
    ].join("\n\n");
    try {
      await transporter.sendMail({
        from: { name: config.fromName, address: config.fromEmail },
        to: message.to,
        subject,
        text,
        html: `<p>Здравствуйте, ${escapeHtml(message.employeeName)}.</p><p>${escapeHtml(message.inviterName)} приглашает вас в кабинет партнёра Novotech компании <strong>${escapeHtml(message.companyName)}</strong>.</p><p><strong>Роль:</strong> ${escapeHtml(message.roleLabel)}</p><p><a href="${escapeHtml(message.invitationUrl)}">Принять приглашение</a></p><p>Ссылка действует до ${escapeHtml(formatDate(message.expiresAt))}.</p><p>Если вы не ожидали приглашение, проигнорируйте это письмо.</p>`,
      });
    } finally {
      transporter.close();
    }
  }
}

function smtpConfig() {
  const required = (name: "SMTP_HOST" | "SMTP_USER" | "SMTP_PASSWORD" | "SMTP_FROM_EMAIL") => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error("SMTP invitation delivery is not configured.");
    return value;
  };
  const port = Number(process.env.SMTP_PORT ?? "587");
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(port) || port < 1 || port > 65535
      || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("SMTP invitation delivery is not configured.");
  }
  return {
    host: required("SMTP_HOST"),
    user: required("SMTP_USER"),
    password: required("SMTP_PASSWORD"),
    fromEmail: required("SMTP_FROM_EMAIL"),
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Novotech Partner",
    port,
    timeoutMs,
    secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}
