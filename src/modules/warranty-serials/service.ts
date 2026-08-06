import "server-only";

import { randomUUID } from "node:crypto";

import { MembershipStatus } from "../access-control/types";
import type { CompanyAccessService } from "../access-control/services";
import type { WarrantySerialRepository } from "./repository";
import { hashSerial, normalizeSerial, revealSerial } from "./serial-security";

export class WarrantySerialService {
  constructor(private readonly repository: WarrantySerialRepository, private readonly companyAccess: CompanyAccessService) {}

  async lookupPartner(userId: string, rawSerial: string) {
    const companyId = await this.companyId(userId);
    return this.repository.lookupPartner(companyId, hashSerial(normalizeSerial(rawSerial)), randomUUID());
  }

  async getPartnerVerification(userId: string, verificationId: string) {
    return this.repository.getPartnerVerification(await this.companyId(userId), uuid(verificationId));
  }

  async lookupInternal(rawSerial: string) {
    const result = await this.repository.lookupInternal(hashSerial(normalizeSerial(rawSerial)), randomUUID());
    return { ...result, serial: result.protectedSerial ? revealSerial(result.protectedSerial) : undefined, protectedSerial: undefined };
  }

  diagnostics() { return this.repository.diagnostics(); }

  private async companyId(userId: string) {
    const membership = (await this.companyAccess.getOwnMemberships(userId)).find((item) => item.status === MembershipStatus.Active);
    if (!membership) throw new Error("Активная компания не найдена.");
    return (await this.companyAccess.getActiveCompanyContext(userId, membership.companyId)).company.id;
  }
}

function uuid(value: string) {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(normalized)) throw new Error("Некорректный идентификатор проверки.");
  return normalized;
}
