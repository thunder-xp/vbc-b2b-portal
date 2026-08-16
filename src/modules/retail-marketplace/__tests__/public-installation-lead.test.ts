import { describe, expect, it, vi } from "vitest";

import type { PublicInstallationLeadRepository } from "../repositories/public-installation-lead.repository";
import { normalizePhone, PublicInstallationLeadInputError, PublicInstallationLeadService } from "../services/public-installation-lead.service";
import { normalizePublicInstallationSourcePath } from "../validation";

describe("public installation lead service", () => {
  it.each([
    ["060 123 456", "+37360123456"],
    ["00373 22 123 456", "+37322123456"],
    ["+40 (721) 123-456", "+40721123456"],
    ["123", null],
  ])("normalizes %s", (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each([
    ["/", "/"],
    ["/calculator/cctv/result", "/calculator/cctv/result"],
    ["/products/dh-c4k-p-29a5f336", "/products/dh-c4k-p-29a5f336"],
    ["/admin/users", "/installation"],
    ["https://example.com", "/installation"],
  ])("normalizes installation source %s", (input, expected) => expect(normalizePublicInstallationSourcePath(input)).toBe(expected));

  it("normalizes and hashes sensitive request identity before persistence", async () => {
    const createPublicInstallationLead = vi.fn().mockResolvedValue({ status: "accepted", leadId: "10000000-0000-4000-8000-000000000001", repeated: false });
    const service = new PublicInstallationLeadService({ createPublicInstallationLead } as unknown as PublicInstallationLeadRepository);
    await service.submit({ locale: "ru", name: "Ivan Test", phone: "060 123 456", locality: "Chișinău", objectType: "office", systemType: "cctv", comment: null, sourcePath: "/calculator/cctv/result", consent: true, submissionKey: "20000000-0000-4000-8000-000000000002" }, "203.0.113.1", "test-secret");
    expect(createPublicInstallationLead).toHaveBeenCalledWith(expect.objectContaining({ phoneE164: "+37360123456", requesterFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/), duplicateFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    expect(JSON.stringify(createPublicInstallationLead.mock.calls)).not.toContain("203.0.113.1");
  });

  it("rejects invalid enums and missing consent before repository work", async () => {
    const createPublicInstallationLead = vi.fn();
    const service = new PublicInstallationLeadService({ createPublicInstallationLead } as unknown as PublicInstallationLeadRepository);
    await expect(service.submit({ locale: "ru", name: "Ivan Test", phone: "+37360123456", locality: "Chișinău", objectType: "office", systemType: "other", comment: null, sourcePath: "/installation", consent: false, submissionKey: "20000000-0000-4000-8000-000000000002" }, "request", "secret")).rejects.toBeInstanceOf(PublicInstallationLeadInputError);
    expect(createPublicInstallationLead).not.toHaveBeenCalled();
  });
});
