import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InvalidStateError, NotFoundError } from "../../../access-control/services";
import type { ProposalDeliveryRepository } from "../../repositories";
import type { ProposalDelivery } from "../../types";
import { ProposalDeliveryService } from "../proposal-delivery.service";
import { ProposalEmailProviderError, type ProposalEmailProvider } from "../proposal-email.provider";

describe("ProposalDeliveryService", () => {
  let repository: ProposalDeliveryRepository;
  let emailProvider: ProposalEmailProvider;
  let sendEmail: ReturnType<typeof vi.fn<ProposalEmailProvider["send"]>>;
  let proposalService: { prepareVersionPreview: ReturnType<typeof vi.fn>; generatePreparedVersionPdf: ReturnType<typeof vi.fn>; downloadPdf: ReturnType<typeof vi.fn> };
  let service: ProposalDeliveryService;
  let claimed: ProposalDelivery | null;

  beforeEach(() => {
    claimed = null;
    repository = {
      listByVersionIds: vi.fn(),
      claim: vi.fn(async (input) => {
        if (claimed) return claimed;
        claimed = delivery({ tokenHash: input.tokenHash, tokenExpiresAt: input.expiresAt, idempotencyKey: input.idempotencyKey });
        return claimed;
      }),
      start: vi.fn(async () => { claimed = delivery({ ...claimed!, status: "sending" }); return claimed; }),
      complete: vi.fn(async () => { claimed = delivery({ ...claimed!, status: "sent", sentAt: "2026-07-18T10:00:00Z" }); return claimed; }),
      fail: vi.fn(async () => { claimed = delivery({ ...claimed!, status: "failed" }); return claimed; }),
      revoke: vi.fn(async () => delivery({ status: "revoked" })),
      findPublic: vi.fn(), trackOpen: vi.fn(), respond: vi.fn(), downloadPublicDocument: vi.fn(),
    };
    proposalService = {
      prepareVersionPreview: vi.fn().mockResolvedValue({ estimateId: "estimate-1", versionId: "version-1", versionNumber: 1, proposal: proposal() }),
      generatePreparedVersionPdf: vi.fn().mockResolvedValue({ id: "document-1", status: "ready", fileSizeBytes: 4 }),
      downloadPdf: vi.fn().mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), filename: "proposal.pdf" }),
    };
    sendEmail = vi.fn<ProposalEmailProvider["send"]>().mockResolvedValue({ messageId: "smtp-1", category: "accepted" });
    emailProvider = { send: sendEmail };
    service = new ProposalDeliveryService(
      repository,
      { findVersion: vi.fn().mockResolvedValue({ id: "version-1", estimateId: "estimate-1", companyId: "company-1", status: "prepared" }) } as never,
      proposalService as never,
      emailProvider,
      { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }) } as never,
      { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) } as never,
    );
  });

  it("sends one ready immutable PDF through the provider and stores only a token hash", async () => {
    const result = await service.send("user-1", sendInput());
    expect(result).toEqual(expect.objectContaining({ estimateId: "estimate-1", status: "sent", attachedPdf: true }));
    const claimInput = vi.mocked(repository.claim).mock.calls[0][0];
    expect(claimInput.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.publicUrl).toMatch(/^https:\/\/www\.nsd\.md\/proposal\/[A-Za-z0-9_-]{40,80}$/);
    expect(result.publicUrl).not.toContain(claimInput.tokenHash);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledTimes(1);
  });

  it("does not send twice when the same idempotency key is claimed concurrently", async () => {
    await service.send("user-1", sendInput());
    const second = await service.send("user-1", sendInput());
    expect(second.publicUrl).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(repository.start).toHaveBeenCalledTimes(1);
  });

  it("preserves a failed delivery and does not complete the version", async () => {
    sendEmail.mockRejectedValue(new ProposalEmailProviderError("timeout"));
    await expect(service.send("user-1", sendInput())).rejects.toBeInstanceOf(InvalidStateError);
    expect(repository.fail).toHaveBeenCalledWith("delivery-1", expect.any(String), "timeout");
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("rejects malformed recipients and header injection before persistence", async () => {
    await expect(service.send("user-1", { ...sendInput(), recipientEmail: "invalid" })).rejects.toBeInstanceOf(InvalidStateError);
    await expect(service.send("user-1", { ...sendInput(), subject: "Proposal\r\nBcc: attacker@example.com" })).rejects.toBeInstanceOf(InvalidStateError);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("renders Romanian transactional copy without exposing provider configuration", async () => {
    await service.send("user-1", { ...sendInput(), locale: "ro" });
    expect(sendEmail.mock.calls[0][0].text).toContain("Vă transmitem oferta comercială");
    expect(JSON.stringify(sendEmail.mock.calls[0][0])).not.toContain("SMTP_PASSWORD");
  });

  it("falls back to a secure link when an attachment is too large or unavailable", async () => {
    proposalService.generatePreparedVersionPdf.mockResolvedValue({ id: "document-1", status: "ready", fileSizeBytes: 9 * 1024 * 1024 });
    expect((await service.send("user-1", sendInput())).attachedPdf).toBe(false);
    expect(proposalService.downloadPdf).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][0].text).toContain("https://www.nsd.md/proposal/");
  });

  it("allows another delivery of a sent immutable version", async () => {
    service = new ProposalDeliveryService(repository, { findVersion: vi.fn().mockResolvedValue({ id: "version-1", estimateId: "estimate-1", companyId: "company-1", status: "sent" }) } as never, proposalService as never, emailProvider, { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }) } as never, { ensurePermission: vi.fn() } as never);
    await expect(service.send("user-1", sendInput())).resolves.toEqual(expect.objectContaining({ status: "sent" }));
  });

  it("denies mutable or finalized version states and cross-company versions", async () => {
    for (const status of ["accepted", "rejected", "archived"]) {
      service = serviceForVersion({ status, companyId: "company-1" });
      await expect(service.send("user-1", sendInput())).rejects.toBeInstanceOf(InvalidStateError);
    }
    service = serviceForVersion({ status: "prepared", companyId: "company-2" });
    await expect(service.send("user-1", sendInput())).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens before any public repository read", async () => {
    await expect(service.getPublic("short")).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.findPublic).not.toHaveBeenCalled();
  });

  it.each(["expired", "revoked", "unknown"])("returns the same safe not-found result for an %s public token", async () => {
    vi.mocked(repository.findPublic).mockResolvedValue(null);
    await expect(service.getPublic("a".repeat(43))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not block a public view when open tracking fails", async () => {
    vi.mocked(repository.trackOpen).mockRejectedValue(new Error("database unavailable"));
    await expect(service.trackOpen("a".repeat(43))).resolves.toBeUndefined();
  });

  it("maps a customer response through the atomic repository operation", async () => {
    vi.mocked(repository.respond).mockResolvedValue({ deliveryId: "delivery-1", companyId: "company-1", estimateId: "estimate-1", versionId: "version-1", response: "accepted", respondedAt: "2026-07-18T10:00:00Z" });
    const result = await service.respond("a".repeat(43), "accepted", " Client ", " Confirmed ");
    expect(result.response).toBe("accepted");
    expect(repository.respond).toHaveBeenCalledWith(expect.objectContaining({ name: "Client", note: "Confirmed" }));
  });

  function serviceForVersion(overrides: { status: string; companyId: string }) {
    return new ProposalDeliveryService(repository, { findVersion: vi.fn().mockResolvedValue({ id: "version-1", estimateId: "estimate-1", ...overrides }) } as never, proposalService as never, emailProvider, { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }) } as never, { ensurePermission: vi.fn() } as never);
  }
});

function sendInput() { return { versionId: "version-1", recipientEmail: "CUSTOMER@example.com", recipientName: "Customer", subject: "Proposal", message: "Please review", locale: "ru" as const, expirationDays: 14, attachPdf: true, idempotencyKey: "11111111-1111-4111-8111-111111111111" }; }
function delivery(overrides: Partial<ProposalDelivery> = {}): ProposalDelivery { return { id: "delivery-1", companyId: "company-1", estimateId: "estimate-1", versionId: "version-1", generatedDocumentId: "document-1", recipientEmail: "customer@example.com", recipientName: "Customer", emailSubject: "Proposal", messageBody: null, locale: "ru", status: "queued", idempotencyKey: "11111111-1111-4111-8111-111111111111", tokenHash: "a".repeat(64), tokenExpiresAt: "2026-08-01T10:00:00Z", createdBy: "user-1", createdAt: "2026-07-18T10:00:00Z", sentAt: null, failedAt: null, safeError: null, revokedAt: null, firstOpenedAt: null, lastOpenedAt: null, openCount: 0, respondedAt: null, response: null, responseName: null, responseNote: null, ...overrides }; }
function proposal() { return { schemaVersion: "2026-07-16-v1" as const, estimateNumber: "KP-2026-1", generatedForDate: "2026-07-18", customerName: "Customer", projectName: "Site", currencyCode: "USD", settings: { title: "Proposal" }, branding: { companyName: "Partner SRL" }, sections: [], charges: [], totals: { subtotal: 0, discounts: 0, charges: 0, totalExcludingVat: 0, vat: 0, total: 0 } }; }
