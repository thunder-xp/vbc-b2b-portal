import type {
  CompanyAccessService,
  UserProfileService,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";

export type WorkspaceActivityDto = {
  id: string;
  label: string;
  description: string;
  occurredAt: string;
};

export type WorkspaceHomeDto = {
  greetingName: string;
  company: {
    id: string;
    name: string;
    status: string;
    priceType: string;
    manager: string;
  };
  catalog: {
    totalProductsLabel: string;
    brands: number;
    categories: number;
  };
  pricing: {
    isActive: boolean;
    priceType: string;
    lastUpdate: string;
  };
  inventory: {
    isSynchronized: boolean;
    lastSynchronization: string;
  };
  activity: WorkspaceActivityDto[];
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto>;
}

const WORKSPACE_PAGE_SIZE = 48;
const FALLBACK_MANAGER = "Novotech partner manager";

export class DefaultWorkspaceHomeService implements WorkspaceHomeService {
  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly companyAccessService: CompanyAccessService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto> {
    const profile = await this.userProfileService.ensureActiveUser(userId);
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
    }

    const context = await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership?.companyId ?? "",
    );
    const [categories, brands, productResult] = await Promise.all([
      this.catalogService.listCategories(userId),
      this.catalogService.listBrands(userId),
      this.catalogService.listProducts(userId, {
        page: 1,
        pageSize: WORKSPACE_PAGE_SIZE,
      }),
    ]);
    const commercialViews =
      await this.pricingInventoryService.getProductCommercialViews(
        userId,
        productResult.products.map((product) => product.id),
      );
    const priceType =
      context.company.external1cPriceTypeId ?? "Partner price type";
    const inventoryLastSynchronization = latestDateLabel(
      commercialViews
        .map((view) => view.stock?.lastUpdatedAt ?? null)
        .filter((value): value is string => Boolean(value)),
    );

    return {
      greetingName: profile.fullName ?? profile.email,
      company: {
        id: context.company.id,
        name: context.company.displayName,
        status: context.company.status,
        priceType,
        manager: FALLBACK_MANAGER,
      },
      catalog: {
        totalProductsLabel: productResult.hasNextPage
          ? `${productResult.products.length}+`
          : String(productResult.products.length),
        brands: brands.length,
        categories: categories.length,
      },
      pricing: {
        isActive: Boolean(context.company.external1cPriceTypeId),
        priceType,
        lastUpdate: commercialViews.some((view) => view.price)
          ? "Available from current read model"
          : "Waiting for price synchronization",
      },
      inventory: {
        isSynchronized: Boolean(inventoryLastSynchronization),
        lastSynchronization:
          inventoryLastSynchronization ?? "Waiting for stock synchronization",
      },
      activity: createWorkspaceActivity(Boolean(inventoryLastSynchronization)),
    };
  }
}

function latestDateLabel(values: string[]): string | null {
  const latest = values
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];

  if (!latest) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(latest));
}

function createWorkspaceActivity(hasInventorySync: boolean): WorkspaceActivityDto[] {
  const now = "2026-07-10T08:00:00.000Z";

  return [
    {
      id: "profile-approved",
      label: "Profile approved",
      description: "Your partner profile is active.",
      occurredAt: now,
    },
    {
      id: "partner-activated",
      label: "Partner activated",
      description: "Company access is ready for daily work.",
      occurredAt: now,
    },
    {
      id: "catalog-synchronized",
      label: "Catalog synchronized",
      description: "Catalog read model is available.",
      occurredAt: now,
    },
    {
      id: "inventory-status",
      label: hasInventorySync ? "Stock synchronized" : "Stock sync pending",
      description: hasInventorySync
        ? "Inventory availability was refreshed."
        : "Inventory will update after the next 1C stock sync.",
      occurredAt: now,
    },
  ];
}
