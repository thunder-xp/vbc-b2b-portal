import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogFavoriteRepository } from "../repositories";
import type { CatalogService } from "./catalog.service";

export interface CatalogFavoriteService {
  getState(userId: string, productId: string): Promise<boolean>;
  toggle(userId: string, productId: string): Promise<boolean>;
}

export class DefaultCatalogFavoriteService implements CatalogFavoriteService {
  constructor(private readonly repository: CatalogFavoriteRepository, private readonly companyAccessService: CompanyAccessService, private readonly catalogService: CatalogService) {}

  async getState(userId: string, productId: string): Promise<boolean> {
    const companyId = await this.resolveCompanyId(userId);
    await this.requireVisibleProduct(userId, productId);
    return this.repository.exists(userId, companyId, productId);
  }

  async toggle(userId: string, productId: string): Promise<boolean> {
    const companyId = await this.resolveCompanyId(userId);
    await this.requireVisibleProduct(userId, productId);
    const exists = await this.repository.exists(userId, companyId, productId);
    if (exists) await this.repository.remove(userId, companyId, productId);
    else await this.repository.add(userId, companyId, productId);
    return !exists;
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    return context.company.id;
  }

  private async requireVisibleProduct(userId: string, productId: string): Promise<void> {
    if ((await this.catalogService.getProductsByIds(userId, [productId])).length !== 1) throw new Error("Catalog product is not available.");
  }
}
