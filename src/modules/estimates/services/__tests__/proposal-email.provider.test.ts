import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  close: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));

import { SmtpProposalEmailProvider } from "../proposal-email.provider";

describe("SmtpProposalEmailProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smtp.createTransport.mockReturnValue({ close: smtp.close, sendMail: smtp.sendMail, verify: smtp.verify });
    smtp.verify.mockResolvedValue(true);
    smtp.sendMail.mockResolvedValue({ messageId: "message-1" });
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASSWORD", "smtp-password");
    vi.stubEnv("SMTP_FROM_EMAIL", "proposals@example.com");
    vi.stubEnv("SMTP_FROM_NAME", "Novotech Systems");
    vi.stubEnv("SMTP_TIMEOUT_MS", "10000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports missing SMTP configuration without opening a transport", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(new SmtpProposalEmailProvider().verify()).resolves.toEqual(expect.objectContaining({
      configured: false, connectionSuccessful: false, authenticationSuccessful: false, errorCategory: "configuration",
    }));
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });

  it("classifies invalid credentials without logging secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    smtp.verify.mockRejectedValue(Object.assign(new Error("Authentication failed for smtp-password"), { code: "EAUTH" }));
    await expect(new SmtpProposalEmailProvider().verify()).resolves.toEqual(expect.objectContaining({
      configured: true, connectionSuccessful: true, authenticationSuccessful: false, errorCategory: "authentication",
    }));
    expect(log).not.toHaveBeenCalled();
  });

  it("verifies a configured transport successfully and closes it", async () => {
    await expect(new SmtpProposalEmailProvider().verify()).resolves.toEqual(expect.objectContaining({
      configured: true, connectionSuccessful: true, authenticationSuccessful: true, errorCategory: null,
    }));
    expect(smtp.verify).toHaveBeenCalledOnce();
    expect(smtp.close).toHaveBeenCalledOnce();
  });

  it("preserves Unicode alternatives and PDF attachment metadata", async () => {
    await new SmtpProposalEmailProvider().send({
      to: "customer@example.com",
      subject: "Коммерческое предложение - Ofertă comercială",
      text: "Здравствуйте. Bună ziua.",
      html: "<p>Здравствуйте. Bună ziua.</p>",
      attachment: { filename: "предложение.pdf", content: new Uint8Array([37, 80, 68, 70]) },
    });
    expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Коммерческое предложение - Ofertă comercială",
      text: "Здравствуйте. Bună ziua.",
      html: "<p>Здравствуйте. Bună ziua.</p>",
      attachments: [expect.objectContaining({ filename: "предложение.pdf", contentType: "application/pdf" })],
    }));
  });
});
