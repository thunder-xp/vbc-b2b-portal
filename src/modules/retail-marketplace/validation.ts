import { z } from "zod";

const serviceType = z.enum(["camera_installation", "cable_laying", "commissioning", "remote_configuration"]);
const unitCode = z.enum(["piece", "meter", "service"]);
const tariffLine = z.object({ serviceType, unitCode, unitPrice: z.coerce.number().nonnegative() });
export const tariffSetSchema = z.object({ tariffSetId: z.uuid(), version: z.number().int().positive(), systemType: z.literal("cctv"), currency: z.string().regex(/^[A-Z]{3}$/), vatTreatment: z.enum(["included", "excluded", "not_specified"]), effectiveFrom: z.string(), lines: z.array(tariffLine).max(4) });
export const publicProvidersSchema = z.array(z.object({ providerId: z.uuid(), displayName: z.string(), description: z.string().nullable(), logoPath: z.string().nullable(), coverage: z.string(), systemType: z.literal("cctv"), availability: z.enum(["available", "limited"]) }));
export const adminReportSchema = z.object({
  tariffSets: z.array(z.object({ id: z.uuid(), version: z.number(), systemType: z.literal("cctv"), status: z.enum(["draft", "published", "superseded", "archived"]), currency: z.string(), vatTreatment: z.enum(["included", "excluded", "not_specified"]), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), revision: z.number(), lines: z.array(tariffLine) })),
  providers: z.array(z.object({ id: z.uuid(), providerType: z.enum(["partner_company", "internal_team"]), backingName: z.string(), operationalStatus: z.enum(["active", "inactive", "suspended"]), approvalStatus: z.enum(["pending", "approved", "rejected"]), marketplaceEnabled: z.boolean(), revision: z.number(), publicNameRu: z.string(), publicNameRo: z.string(), publicProfileStatus: z.enum(["draft", "published"]), availability: z.enum(["available", "limited", "unavailable"]), maxConcurrentJobs: z.number().nullable(), acceptanceSlaMinutes: z.number(), competencies: z.array(z.string()), regions: z.array(z.string()) })),
  regions: z.array(z.object({ id: z.uuid(), code: z.string(), nameRu: z.string(), nameRo: z.string(), regionType: z.string() })),
  partnerCompanies: z.array(z.object({ id: z.uuid(), name: z.string() })),
  internalTeams: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export { serviceType, tariffLine, unitCode };
