import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";

import { installationLeadObjectType, installationLeadSystemType, normalizePublicInstallationSourcePath } from "../validation";
import type { PublicInstallationLeadRepository } from "../repositories/public-installation-lead.repository";
import type { PublicInstallationLeadInput } from "../types";

const inputSchema = z.object({
  locale: z.enum(["ru", "ro"]),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  locality: z.string().trim().min(2).max(120),
  objectType: installationLeadObjectType,
  systemType: installationLeadSystemType,
  comment: z.string().trim().max(1000).nullable(),
  sourcePath: z.string().trim().min(1).max(300).refine((value) => value === "/" || /^\/[^/]/.test(value)),
  consent: z.literal(true),
  submissionKey: z.uuid(),
});

export class PublicInstallationLeadInputError extends Error {}

export class PublicInstallationLeadService {
  constructor(private readonly repository: PublicInstallationLeadRepository) {}

  async submit(input: PublicInstallationLeadInput, requestIdentity: string, fingerprintSecret: string) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new PublicInstallationLeadInputError("Invalid public installation lead.");
    const phoneE164 = normalizePhone(parsed.data.phone);
    if (!phoneE164) throw new PublicInstallationLeadInputError("Invalid public installation lead phone.");
    const keyedHash = (value: string) => createHmac("sha256", fingerprintSecret).update(value, "utf8").digest("hex");
    return this.repository.createPublicInstallationLead({
      locale: parsed.data.locale,
      customerName: parsed.data.name,
      phoneE164,
      locality: parsed.data.locality,
      objectType: parsed.data.objectType,
      systemType: parsed.data.systemType,
      comment: parsed.data.comment || null,
      sourcePath: normalizePublicInstallationSourcePath(parsed.data.sourcePath),
      consent: true,
      submissionKey: parsed.data.submissionKey,
      requesterFingerprint: keyedHash(requestIdentity),
      duplicateFingerprint: keyedHash([phoneE164, parsed.data.locality.toLocaleLowerCase("ro-MD"), parsed.data.objectType, parsed.data.systemType].join("|")),
    });
  }
}

export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact.startsWith("373") ? `+${compact}` : compact;
  const normalized = /^0\d{8}$/.test(international) ? `+373${international.slice(1)}` : international;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
