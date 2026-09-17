import "server-only";

import { MembershipStatus } from "../access-control/types";
import type { CompanyAccessService } from "../access-control/services";
import { revealSerial } from "../warranty-serials/serial-security";
import { ONE_C_SERVICE_STATUSES } from "./types";
import type { ServiceHistoryRepository } from "./repository";

export class ServiceHistoryService {
  constructor(private readonly repository: ServiceHistoryRepository, private readonly access: CompanyAccessService) {}
  async listPartner(userId: string, input: { query?: string; filter?: string; page?: string | number }) {
    return this.repository.listPartner({ companyId: await this.companyId(userId), query: trim(input.query,100), filter: ["active","ready","completed","all"].includes(input.filter ?? "") ? input.filter! : "all", page: page(input.page) });
  }
  async getPartnerWorkspace(userId: string, input: { query?: string; filter?: string; page?: string | number; month?: string }) {
    return this.repository.getPartnerWorkspace({
      companyId: await this.companyId(userId),
      query: trim(input.query, 100),
      filter: ["active", "ready", "completed", "all"].includes(input.filter ?? "") ? input.filter! : "all",
      page: page(input.page),
      month: normalizeServiceMonth(input.month),
    });
  }
  async getPartnerMonthExport(userId: string, input: { month?: string }) {
    const result = await this.repository.getPartnerMonthExport({
      companyId: await this.companyId(userId),
      month: normalizeServiceMonth(input.month),
    });
    if (result.truncated || result.rowCount > 5000) throw new Error("Service export exceeds the governed row limit.");
    return result;
  }
  async getPartner(_userId: string, id: string) { return this.repository.getPartner(uuid(id)); }
  listAdmin(input: { query?: string; status?: string; page?: string | number }) { return this.repository.listAdmin({ query: trim(input.query,100), status: ONE_C_SERVICE_STATUSES.includes(input.status as never) ? input.status! : null, page: page(input.page) }); }
  async getAdmin(id: string) {
    const detail = await this.repository.getAdmin(uuid(id));
    if (!detail) return null;
    const { protectedSerial, ...safeDetail } = detail;
    return { ...safeDetail, serial: protectedSerial ? revealSerial(protectedSerial) : null };
  }
  diagnostics() { return this.repository.diagnostics(); }
  private async companyId(userId: string) { const membership=(await this.access.getOwnMemberships(userId)).find((item)=>item.status===MembershipStatus.Active); if(!membership) throw new Error("Active company is unavailable."); return membership.companyId; }
}
function trim(value: unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}
function page(value:unknown){const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>0?Math.min(parsed,100000):1;}
function uuid(value:string){const normalized=value.trim();if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(normalized))throw new Error("Invalid service history identifier.");return normalized;}

export function normalizeServiceMonth(value: unknown, now = new Date()): string {
  const current = monthKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const minimumDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 59, 1));
  const minimum = monthKey(minimumDate.getUTCFullYear(), minimumDate.getUTCMonth() + 1);
  const candidate = typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : current;
  return candidate < minimum ? minimum : candidate > current ? current : candidate;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
