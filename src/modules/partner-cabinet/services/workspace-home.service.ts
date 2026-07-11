import { InvalidStateError } from "../../access-control/services";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type {
  PartnerWorkspaceContextService,
  PartnerWorkspaceModule,
} from "./workspace-context.service";

export type WorkspaceActivityDto = {
  id: string;
  label: string;
  description: string;
  occurredAt: string;
};

export type WorkspaceHomeDto = {
  greetingName: string;
  company: {
    name: string;
    status: string;
    role: string;
    external1cCode: string;
    priceType: string;
    accessStatus: string;
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
  operational: {
    activeOrders: number;
    openProjects: number;
    documentsRequiringAttention: number;
    supportRequests: number;
  };
  activity: WorkspaceActivityDto[];
  modules: PartnerWorkspaceModule[];
  commercialConfigurationMissing: boolean;
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto>;
}

const WORKSPACE_PAGE_SIZE = 48;

export class DefaultWorkspaceHomeService implements WorkspaceHomeService {
  constructor(
    private readonly workspaceContextService: PartnerWorkspaceContextService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (context.accessState !== "active" && context.accessState !== "missing_price_type") {
      throw new InvalidStateError("Partner workspace access is not active.");
    }

    const [categories, brands, productResult] = await Promise.all([
      this.catalogService.listCategories(userId),
      this.catalogService.listBrands(userId),
      this.catalogService.listProducts(userId, { page: 1, pageSize: WORKSPACE_PAGE_SIZE }),
    ]);
    const commercialViews = context.accessState === "active"
      ? await this.pricingInventoryService.getProductCommercialViews(
          userId,
          productResult.products.map((product) => product.id),
        )
      : [];
    const inventoryLastSynchronization = latestDateLabel(
      commercialViews
        .map((view) => view.stock?.lastUpdatedAt ?? null)
        .filter((value): value is string => Boolean(value)),
    );
    const priceType = context.priceTypeName ?? "Не настроен";

    return {
      greetingName: context.userDisplayName,
      company: {
        name: context.companyName ?? "Компания не найдена",
        status: context.companyStatus ?? "Не определён",
        role: context.membershipRole ?? "Не определена",
        external1cCode: context.external1cCode ?? "Не указан",
        priceType,
        accessStatus: context.accessState === "active" ? "Активен" : "Требуется настройка",
      },
      catalog: {
        totalProductsLabel: productResult.hasNextPage ? `${productResult.products.length}+` : String(productResult.products.length),
        brands: brands.length,
        categories: categories.length,
      },
      pricing: {
        isActive: context.accessState === "active",
        priceType,
        lastUpdate: commercialViews.some((view) => view.price)
          ? "Данные доступны"
          : "Нет синхронизированных данных",
      },
      inventory: {
        isSynchronized: Boolean(inventoryLastSynchronization),
        lastSynchronization: inventoryLastSynchronization ?? "Нет синхронизированных данных",
      },
      operational: {
        activeOrders: 0,
        openProjects: 0,
        documentsRequiringAttention: 0,
        supportRequests: 0,
      },
      activity: [],
      modules: context.availableModules,
      commercialConfigurationMissing: context.accessState === "missing_price_type",
    };
  }
}

function latestDateLabel(values: string[]): string | null {
  const latest = values
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];

  if (!latest) return null;

  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(latest));
}
