import "server-only";
import { MembershipStatus } from "../access-control/types";
import type { CompanyAccessService } from "../access-control/services";
import type { ServiceCenterRepository } from "./repository";
import { SERVICE_CASE_TYPES, SERVICE_STATUSES, type ServiceCaseCreateInput, type ServiceStatus } from "./types";

export class ServiceCenterValidationError extends Error { constructor(message: string) { super(message); this.name = "ServiceCenterValidationError"; } }

export class ServiceCenterService {
  constructor(private readonly repository: ServiceCenterRepository, private readonly companyAccess: CompanyAccessService) {}
  async listPartner(userId: string, input: { query?: string | null; status?: string | null; page?: string | number | null }) {
    return this.repository.listPartner({ companyId: await this.companyId(userId), query: trim(input.query, 100), status: validStatus(input.status), page: page(input.page) });
  }
  async getPartner(userId: string, caseId: string) { await this.companyId(userId); return this.repository.get(uuid(caseId)); }
  async selections(userId: string) { return this.repository.getSelections(await this.companyId(userId)); }
  async create(userId: string, input: ServiceCaseCreateInput) {
    if (!SERVICE_CASE_TYPES.includes(input.caseType)) throw new ServiceCenterValidationError("Выберите тип обращения.");
    if (input.description.trim().length < 10) throw new ServiceCenterValidationError("Опишите проблему подробнее.");
    if (!input.evidenceConsent) throw new ServiceCenterValidationError("Подтвердите согласие на обработку материалов.");
    return this.repository.create(await this.companyId(userId), { ...input, enteredSerial: trim(input.enteredSerial, 120), faultCategory: trim(input.faultCategory, 100), description: trim(input.description, 4000), symptoms: trim(input.symptoms, 2000), preferredContact: trim(input.preferredContact, 200) });
  }
  async respond(userId: string, caseId: string, message: string) { await this.companyId(userId); return this.repository.addPartnerMessage(uuid(caseId), trim(message, 4000)); }
  async partnerAction(userId: string, input: { caseId: string; expectedVersion: number; action: string; message: string }) {
    await this.companyId(userId);
    if (!["provide_information","confirm_equipment_sent","cancel"].includes(input.action)) throw new ServiceCenterValidationError("Действие недоступно.");
    return this.repository.performPartnerAction({ caseId: uuid(input.caseId), expectedVersion: Math.max(1,Math.trunc(input.expectedVersion)), action: input.action, message: trim(input.message,4000) });
  }
  async dashboard(userId: string) { return this.repository.getDashboard(await this.companyId(userId)); }
  async adminAttention() { return this.repository.getAdminAttention(10); }
  async diagnostics() { return this.repository.getDiagnostics(); }
  async listAdmin(input: { query?: string | null; status?: string | null; page?: string | number | null }) { return this.repository.listAdmin({ query: trim(input.query, 100), status: validStatus(input.status), page: page(input.page) }); }
  async getAdmin(caseId: string) { return this.repository.get(uuid(caseId)); }
  async transition(input: { caseId: string; expectedVersion: number; status: string; partnerMessage: string; internalNote: string; assigneeId: string | null }) {
    const status = validStatus(input.status); if (!status) throw new ServiceCenterValidationError("Выберите следующий статус.");
    return this.repository.transition({ ...input, caseId: uuid(input.caseId), expectedVersion: Math.max(1, Math.trunc(input.expectedVersion)), status, partnerMessage: trim(input.partnerMessage, 4000), internalNote: trim(input.internalNote, 4000), assigneeId: input.assigneeId ? uuid(input.assigneeId) : null });
  }
  private async companyId(userId: string) { const membership=(await this.companyAccess.getOwnMemberships(userId)).find((item)=>item.status===MembershipStatus.Active); if(!membership) throw new ServiceCenterValidationError("Активная компания не найдена."); return (await this.companyAccess.getActiveCompanyContext(userId,membership.companyId)).company.id; }
}
function trim(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function page(value: unknown) { const parsed=Number(value); return Number.isSafeInteger(parsed)&&parsed>0?Math.min(parsed,100000):1; }
function validStatus(value: unknown): ServiceStatus|null { return typeof value === "string"&&SERVICE_STATUSES.includes(value as ServiceStatus)?value as ServiceStatus:null; }
function uuid(value:string){const normalized=value.trim();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized))throw new ServiceCenterValidationError("Некорректный идентификатор.");return normalized;}
