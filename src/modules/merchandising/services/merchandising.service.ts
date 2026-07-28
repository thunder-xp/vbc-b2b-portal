import "server-only";

import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { MerchandisingRepository } from "../repositories";
import type {
  AdminMerchandisingPage,
  ManageMerchandisingInput,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../types";

const LABEL_CODES = new Set<MerchandisingLabelCode>(["NEW", "TOP", "HOT"]);
const OPERATIONS = new Set(["assign", "revoke", "hide", "show"]);

export class MerchandisingValidationError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "MerchandisingValidationError";
  }
}

export class MerchandisingService {
  constructor(
    private readonly repository: MerchandisingRepository,
    private readonly companyAccessService: CompanyAccessService,
  ) {}

  listAdminProducts(input: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminMerchandisingPage> {
    return this.repository.listAdminProducts({
      search: input.search?.trim().slice(0, 100) || undefined,
      page: positiveInteger(input.page, 1),
      pageSize: Math.min(positiveInteger(input.pageSize, 25), 50),
    });
  }

  async listPublished(
    userId: string,
    labelCode?: MerchandisingLabelCode,
    limitPerLabel = 8,
  ): Promise<PublishedMerchandisingAssignment[]> {
    if (labelCode && !LABEL_CODES.has(labelCode)) {
      throw new MerchandisingValidationError("MERCHANDISING_LABEL_INVALID");
    }

    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find(
      (candidate) => candidate.status === MembershipStatus.Active,
    );
    if (!membership) {
      throw new MerchandisingValidationError("MERCHANDISING_COMPANY_REQUIRED");
    }

    await this.companyAccessService.getActiveCompanyContext(
      userId,
      membership.companyId,
    );
    return this.repository.listPublished({
      companyId: membership.companyId,
      labelCode,
      limitPerLabel: Math.min(Math.max(Math.floor(limitPerLabel), 1), 24),
    });
  }

  async listPublishedForProducts(
    userId: string,
    productIds: string[],
  ): Promise<PublishedMerchandisingAssignment[]> {
    const normalizedIds = [...new Set(productIds.map((id) => id.trim()))];
    if (
      normalizedIds.length < 1 ||
      normalizedIds.length > 100 ||
      normalizedIds.some((id) => !isUuid(id))
    ) {
      throw new MerchandisingValidationError("MERCHANDISING_PRODUCTS_INVALID");
    }
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find(
      (candidate) => candidate.status === MembershipStatus.Active,
    );
    if (!membership) {
      throw new MerchandisingValidationError("MERCHANDISING_COMPANY_REQUIRED");
    }
    await this.companyAccessService.getActiveCompanyContext(
      userId,
      membership.companyId,
    );
    return this.repository.listPublishedForProducts({
      companyId: membership.companyId,
      productIds: normalizedIds,
    });
  }

  manage(input: ManageMerchandisingInput): Promise<number> {
    const productIds = [...new Set(input.productIds.map((id) => id.trim()))];
    const reason = input.reason.trim();
    const priority = input.priority ?? 100;

    if (
      !OPERATIONS.has(input.operation) ||
      !LABEL_CODES.has(input.labelCode) ||
      productIds.length < 1 ||
      productIds.length > 100 ||
      productIds.some((id) => !isUuid(id)) ||
      reason.length < 3 ||
      reason.length > 500 ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 1000
    ) {
      throw new MerchandisingValidationError("MERCHANDISING_INPUT_INVALID");
    }

    const startsAt = validTimestamp(input.startsAt);
    const endsAt = validTimestamp(input.endsAt);
    if (
      input.operation === "assign" &&
      ((input.labelCode === "HOT" || input.labelCode === "NEW") && !endsAt)
    ) {
      throw new MerchandisingValidationError(
        "MERCHANDISING_EXPIRY_REQUIRED",
      );
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new MerchandisingValidationError("MERCHANDISING_INTERVAL_INVALID");
    }

    return this.repository.manage({
      operation: input.operation,
      productIds,
      labelCode: input.labelCode,
      startsAt,
      endsAt,
      priority,
      reason,
    });
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function validTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new MerchandisingValidationError("MERCHANDISING_DATE_INVALID");
  }
  return new Date(timestamp).toISOString();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
