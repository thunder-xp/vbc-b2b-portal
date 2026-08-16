import { z } from "zod";

export const installationLeadObjectType = z.enum(["apartment", "house", "office", "retail", "warehouse", "production", "other"]);
export const installationLeadSystemType = z.enum(["cctv", "access_control", "alarm", "intercom", "network", "other"]);
export function normalizePublicInstallationSourcePath(value: string | null | undefined) {
  if (value === "/" || value === "/installation" || value === "/calculator/cctv/result") return value;
  return value && /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : "/installation";
}
export const publicInstallationLeadResultSchema = z.object({ status: z.enum(["accepted", "conflict", "rate_limited"]), leadId: z.uuid().nullable(), repeated: z.boolean() });
export const publicInstallationLeadAdminSchema = z.array(z.object({
  id: z.uuid(), createdAt: z.string(), locale: z.enum(["ru", "ro"]), customerName: z.string(), phone: z.string(), locality: z.string(),
  objectType: installationLeadObjectType, systemType: installationLeadSystemType, comment: z.string().nullable(), sourcePath: z.string(),
  status: z.enum(["new", "in_progress", "contacted", "closed"]),
})).max(100);

const serviceType = z.enum(["camera_installation", "cable_laying", "commissioning", "remote_configuration",
  "equipment_installation_class_2", "equipment_installation_class_3", "cable_routing_class_2", "cable_routing_class_3",
  "ai_scenario_programming"]);
const unitCode = z.enum(["piece", "meter", "service"]);
const tariffLine = z.object({ serviceType, unitCode, unitPrice: z.coerce.number().nonnegative() });
export const tariffSetSchema = z.object({ tariffSetId: z.uuid(), version: z.number().int().positive(), systemType: z.literal("cctv"), currency: z.string().regex(/^[A-Z]{3}$/), vatTreatment: z.enum(["included", "excluded", "not_specified"]), effectiveFrom: z.string(), lines: z.array(tariffLine).max(9) });
export const publicProvidersSchema = z.array(z.object({ providerId: z.uuid(), displayName: z.string(), description: z.string().nullable(), logoPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/).max(100).nullable(), coverage: z.string(), systemType: z.literal("cctv"), availability: z.enum(["available", "limited"]) }));
export const adminReportSchema = z.object({
  tariffSets: z.array(z.object({ id: z.uuid(), version: z.number(), systemType: z.literal("cctv"), status: z.enum(["draft", "published", "superseded", "archived"]), currency: z.string(), vatTreatment: z.enum(["included", "excluded", "not_specified"]), effectiveFrom: z.string(), effectiveTo: z.string().nullable(), revision: z.number(), lines: z.array(tariffLine) })),
  providers: z.array(z.object({ id: z.uuid(), providerType: z.enum(["partner_company", "internal_team"]), backingName: z.string(), operationalStatus: z.enum(["active", "inactive", "suspended"]), approvalStatus: z.enum(["pending", "approved", "rejected"]), marketplaceEnabled: z.boolean(), revision: z.number(), publicNameRu: z.string(), publicNameRo: z.string(), publicProfileStatus: z.enum(["draft", "published"]), availability: z.enum(["available", "limited", "unavailable"]), maxConcurrentJobs: z.number().nullable(), acceptanceSlaMinutes: z.number(), competencies: z.array(z.string()), regions: z.array(z.string()) })),
  regions: z.array(z.object({ id: z.uuid(), code: z.string(), nameRu: z.string(), nameRo: z.string(), regionType: z.string() })),
  partnerCompanies: z.array(z.object({ id: z.uuid(), name: z.string() })),
  internalTeams: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
const assignmentStatus = z.enum(["offered", "accepted", "declined", "timed_out", "withdrawn"]);
export const executionState = z.enum(["scheduling", "scheduled", "in_progress", "completed_by_provider", "customer_confirmation_pending", "customer_confirmed", "issue_reported", "disputed", "resolved", "cancelled"]);
export const executionResultSchema = z.object({ executionId: z.uuid(), state: executionState, revision: z.coerce.number().int().nonnegative(), repeated: z.boolean(), scheduledStartAt: z.string().nullable(), scheduledEndAt: z.string().nullable() });
const address = z.object({ locality: z.string(), street: z.string(), building: z.string(), unit: z.string().nullable().optional(), postalCode: z.string().nullable().optional(), instructions: z.string().nullable().optional() });
export const partnerAssignmentsSchema = z.array(z.object({
  attemptId: z.uuid(), requirementId: z.uuid(), orderNumber: z.string(), ordinal: z.coerce.number().int().positive(), status: assignmentStatus,
  source: z.enum(["customer_selected", "automatic", "manual_internal", "reassignment", "fallback_internal"]),
  offeredAt: z.string(), deadlineAt: z.string(), locality: z.string(), systemType: z.literal("cctv"),
  scope: z.array(z.object({ serviceType, quantity: z.coerce.number().positive(), unitCode })).max(20),
  customerInstallationCharge: z.null(), providerPayable: z.null(),
  customer: z.object({ name: z.string(), phone: z.string(), email: z.string().nullable() }).nullable(), exactAddress: address.nullable(),
  execution: z.object({ id: z.uuid(), state: executionState, revision: z.coerce.number().int().nonnegative(), scheduledStartAt: z.string().nullable(), scheduledEndAt: z.string().nullable(), providerCompletedAt: z.string().nullable(), customerConfirmedAt: z.string().nullable(), issueCategory: z.string().nullable(), completedAt: z.string().nullable() }).nullable(),
})).max(200);
export const dispatchResultSchema = z.object({ requirementId: z.uuid(), status: z.enum(["assignment_pending", "offered", "assigned", "assignment_unavailable"]), attemptId: z.uuid().optional(), providerId: z.uuid().optional(), source: z.string().optional(), ordinal: z.coerce.number().int().positive().optional(), repeated: z.boolean() });
export const paymentActivationResultSchema = z.object({
  orderId: z.uuid(), orderNumber: z.string().min(1), status: z.literal("confirmed"),
  installationRequirementId: z.uuid().nullable(), assignment: dispatchResultSchema.nullable(), repeated: z.boolean(),
});
export const assignmentResponseSchema = z.object({ attemptId: z.uuid(), requirementId: z.uuid().optional(), status: z.enum(["accepted", "declined"]), executionId: z.uuid().optional(), repeated: z.boolean() });
export const assignmentAdminReportSchema = z.object({ requirements: z.array(z.object({
  id: z.uuid(), orderNumber: z.string(), status: z.enum(["assignment_pending", "offered", "reassignment_pending", "assigned", "assignment_unavailable"]), selectionMode: z.enum(["customer_selected", "automatic"]), locality: z.string(), customerInstallationCharge: z.coerce.number().nonnegative(), currency: z.string(), revision: z.coerce.number().int().nonnegative(), currentAttemptId: z.uuid().nullable(), acceptedProviderId: z.uuid().nullable(), activatedAt: z.string(), execution: z.object({ id: z.uuid(), state: executionState, revision: z.coerce.number().int().nonnegative(), providerId: z.uuid(), scheduledStartAt: z.string().nullable(), scheduledEndAt: z.string().nullable(), updatedAt: z.string(), issueCategory: z.string().nullable() }).nullable(), attempts: z.array(z.object({ id: z.uuid(), ordinal: z.coerce.number().int().positive(), providerId: z.uuid(), source: z.string(), status: assignmentStatus, offeredAt: z.string(), deadlineAt: z.string(), declineReasonCode: z.string().nullable() }))
})).max(200) });
export { serviceType, tariffLine, unitCode };
