import { beforeEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  close: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));

import {
  CompanyInvitationEmailProviderError,
  SmtpCompanyInvitationEmailProvider,
} from "../company-invitation-email.provider";

describe("SmtpCompanyInvitationEmailProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASSWORD", "secret");
    vi.stubEnv("SMTP_FROM_EMAIL", "partner@example.com");
    vi.stubEnv("SMTP_SECURE", "false");
    smtp.createTransport.mockReturnValue({ close: smtp.close, sendMail: smtp.sendMail });
  });

  it.each([
    ["EAUTH", "authentication"],
    ["ETIMEDOUT", "timeout"],
    ["EENVELOPE", "rejected"],
    ["ECONNECTION", "unavailable"],
  ] as const)("classifies %s without exposing the provider response", async (code, category) => {
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("raw provider response"), { code }));
    await expect(new SmtpCompanyInvitationEmailProvider().send(message())).rejects.toEqual(
      expect.objectContaining<Partial<CompanyInvitationEmailProviderError>>({
        name: "CompanyInvitationEmailProviderError",
        category,
        message: "Company invitation email provider failed.",
      }),
    );
  });

  it("reports missing configuration safely", async () => {
    vi.stubEnv("SMTP_FROM_EMAIL", "");
    await expect(new SmtpCompanyInvitationEmailProvider().send(message())).rejects.toEqual(
      expect.objectContaining({ category: "configuration" }),
    );
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
});

function message() {
  return {
    to: "employee@example.com",
    employeeName: "Employee",
    companyName: "Company",
    inviterName: "Owner",
    roleLabel: "Покупатель",
    invitationUrl: "https://example.com/invitation",
    expiresAt: "2026-08-18T00:00:00.000Z",
  };
}
