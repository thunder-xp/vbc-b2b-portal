import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { CctvObjectType } from "./cctv-engine";
import type { CctvObjectConfiguration, CctvResolvedObjectService, CctvServiceCode, CctvServiceRequestType } from "./cctv-object-configuration";

export class SupabaseCctvObjectConfigurationRepository {
  async listAdmin(): Promise<CctvObjectConfiguration[]> {
    const { data, error } = await (await createClient()).rpc("get_all_cctv_object_configurations");
    if (error || !Array.isArray(data)) throw new Error("CCTV object configurations are unavailable.");
    return data.map((item) => parseConfiguration(item as Record<string, unknown>));
  }

  async getAdmin(objectType: CctvObjectType): Promise<CctvObjectConfiguration> {
    const { data, error } = await (await createClient()).rpc("get_cctv_object_configuration", { target_object_type: objectType });
    if (error || !data || typeof data !== "object") throw new Error("CCTV object configuration is unavailable.");
    return parseConfiguration(data as Record<string, unknown>);
  }

  async resolve(objectType: CctvObjectType, serviceTypes: CctvServiceRequestType[]): Promise<CctvResolvedObjectService[]> {
    if (!serviceTypes.length) return [];
    const { data, error } = await createAdminClient().rpc("resolve_cctv_object_services", {
      target_object_type: objectType, target_service_types: [...new Set(serviceTypes)],
    });
    if (error || !Array.isArray(data)) throw new Error("CCTV object services are unavailable.");
    return data.map(parseResolvedService);
  }

  async resolveForGenerator(companyId: string, sessionId: string, profileKeys: string[]): Promise<CctvResolvedObjectService[]> {
    if (!profileKeys.length) return [];
    const { data, error } = await (await createClient()).rpc("resolve_generator_cctv_object_services", {
      target_company_id: companyId, target_session_id: sessionId, target_profile_keys: [...new Set(profileKeys)],
    });
    if (error || !Array.isArray(data)) throw new Error("CCTV generator services are unavailable.");
    return data.map(parseResolvedService);
  }

  async upsert(input: { objectType: CctvObjectType; serviceCode: CctvServiceCode; enabled: boolean;
    calculatorDefault: boolean; displayOrder: number; notes: string; expectedVersion: number }) {
    const { data, error } = await (await createClient()).rpc("upsert_cctv_object_service_binding", {
      target_object_type: input.objectType, target_service_code: input.serviceCode, target_enabled: input.enabled,
      target_calculator_default: input.calculatorDefault, target_display_order: input.displayOrder,
      target_notes: input.notes, expected_version: input.expectedVersion,
    });
    if (error || !data?.[0]) throw new Error(error?.code === "PT409" ? "CCTV_SERVICE_BINDING_CONFLICT" : "CCTV service binding could not be saved.");
    return { bindingId: String(data[0].binding_id), version: Number(data[0].resulting_version) };
  }
}

function parseConfiguration(value: Record<string, unknown>): CctvObjectConfiguration {
  const tariff = value.tariffSet;
  return {
    objectType: String(value.objectType) as CctvObjectType,
    tariffSet: tariff && typeof tariff === "object" ? {
      id: String((tariff as Record<string, unknown>).id), version: Number((tariff as Record<string, unknown>).version),
      currency: String((tariff as Record<string, unknown>).currency),
      vatTreatment: String((tariff as Record<string, unknown>).vatTreatment) as "included" | "excluded" | "not_specified",
    } : null,
    services: Array.isArray(value.services) ? value.services.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        bindingId: String(row.bindingId), serviceCode: String(row.serviceCode), family: String(row.family),
        complexityClass: row.complexityClass == null ? null : Number(row.complexityClass), label: String(row.label),
        unitCode: String(row.unitCode), enabled: row.enabled === true, calculatorDefault: row.calculatorDefault === true,
        displayOrder: Number(row.displayOrder), notes: typeof row.notes === "string" ? row.notes : null,
        version: Number(row.version), partnerServiceId: typeof row.partnerServiceId === "string" ? row.partnerServiceId : null,
        tariffServiceType: String(row.tariffServiceType), tariffActive: row.tariffActive === true,
        unitPrice: row.unitPrice == null ? null : Number(row.unitPrice), currency: typeof row.currency === "string" ? row.currency : null,
        vatTreatment: typeof row.vatTreatment === "string" ? row.vatTreatment : null,
      } as CctvObjectConfiguration["services"][number];
    }) : [],
  };
}

function parseResolvedService(value: unknown): CctvResolvedObjectService {
  const row = value as Record<string, unknown>;
  return {
    requestServiceType: String(row.requestServiceType) as CctvServiceRequestType,
    profileKey: typeof row.profileKey === "string" ? row.profileKey : undefined,
    serviceCode: typeof row.serviceCode === "string" ? row.serviceCode as CctvServiceCode : null,
    partnerServiceId: typeof row.partnerServiceId === "string" ? row.partnerServiceId : null,
    unitCode: typeof row.unitCode === "string" ? row.unitCode as CctvResolvedObjectService["unitCode"] : null,
    unitPrice: row.unitPrice == null ? null : Number(row.unitPrice), currency: typeof row.currency === "string" ? row.currency : null,
    vatTreatment: typeof row.vatTreatment === "string" ? row.vatTreatment as CctvResolvedObjectService["vatTreatment"] : null,
    tariffSetId: typeof row.tariffSetId === "string" ? row.tariffSetId : null,
    tariffVersion: row.tariffVersion == null ? null : Number(row.tariffVersion),
  };
}
