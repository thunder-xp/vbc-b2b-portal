import { InvalidStateError } from "../../access-control/services";
import { evaluateFreshness, type FreshnessView } from "../../integration/freshness";
import type { CommercialFreshnessReadModel } from "../repositories/commercial-freshness.repository";
import type { WorkspaceNavigationItem } from "./workspace-capability.service";
import type { PartnerWorkspaceContextService } from "./workspace-context.service";

export type WorkspaceQuickActionDto = {
  key: string;
  label: string;
  href: string | null;
  availability: "available" | "coming_soon";
};

export type WorkspaceProcessCardDto = {
  key: string;
  title: string;
  status: "normal" | "warning";
  summary: string;
  actionLabel: string;
  href: string;
};

export type WorkspaceHomeDto = {
  greetingName: string;
  company: {
    name: string;
    role: string;
    external1cCode: string;
    priceType: string | null;
    accountManager: string | null;
  };
  quickActions: WorkspaceQuickActionDto[];
  processCards: WorkspaceProcessCardDto[];
  commercialConfigurationMissing: boolean;
  commercialFreshness: Array<{ domain: "rates" | "prices" | "stock" | "arrivals"; label: string; freshness: FreshnessView }>;
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto>;
}

export class DefaultWorkspaceHomeService implements WorkspaceHomeService {
  constructor(
    private readonly workspaceContextService: PartnerWorkspaceContextService,
    private readonly commercialFreshnessReadModel: CommercialFreshnessReadModel,
  ) {}

  async getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (context.accessState !== "active" && context.accessState !== "missing_price_type") {
      throw new InvalidStateError("Partner workspace access is not active.");
    }

    const freshness = await this.commercialFreshnessReadModel.getFreshness();
    const freshnessByDomain = new Map(freshness.map((item) => [item.domain, item.updatedAt]));

    return {
      greetingName: context.userDisplayName,
      company: {
        name: context.companyName ?? "Компания не найдена",
        role: context.membershipRole ?? "Не определена",
        external1cCode: context.external1cCode ?? "Не указан",
        priceType: context.capabilities.productCard.showPartnerPrice
          ? context.priceTypeName ?? (context.external1cPriceTypeId ? "Назначен" : "Не настроен")
          : null,
        accountManager: null,
      },
      quickActions: buildQuickActions(context.capabilities.navigation),
      processCards: buildProcessCards(context.capabilities.navigation, context.capabilities.canManageCompanyUsers ?? false, freshnessByDomain),
      commercialConfigurationMissing: context.accessState === "missing_price_type",
      commercialFreshness: [
        freshnessItem("prices", "Цены", freshnessByDomain.get("prices")),
        freshnessItem("stock", "Остатки", freshnessByDomain.get("stock")),
        freshnessItem("rates", "Коммерческие курсы", freshnessByDomain.get("rates")),
        freshnessItem("arrivals", "Ожидаемые поступления", freshnessByDomain.get("arrivals")),
      ],
    };
  }
}

function freshnessItem(domain: "rates" | "prices" | "stock" | "arrivals", label: string, updatedAt: string | null | undefined) {
  return {
    domain,
    label,
    freshness: evaluateFreshness(updatedAt, domain === "stock" || domain === "arrivals" ? "stock" : "price", label),
  };
}

function buildProcessCards(navigation: WorkspaceNavigationItem[], canManageUsers: boolean, freshness: Map<string, string | null>): WorkspaceProcessCardDto[] {
  const available = new Map(navigation.filter((item) => item.availability === "available" && item.href).map((item) => [item.key, item.href!]));
  const cards: WorkspaceProcessCardDto[] = [];
  if (available.has("orders")) cards.push({ key: "orders", title: "Заказы", status: "normal", summary: "Проверьте активные заказы, даты отгрузки и позиции, требующие уточнения.", actionLabel: "Мои заказы", href: available.get("orders")! });
  if (available.has("reservations")) cards.push({ key: "shipments", title: "Планируемые отгрузки", status: "normal", summary: "Контролируйте ближайшие и просроченные даты отгрузки.", actionLabel: "Открыть отгрузки", href: available.get("reservations")! });
  if (available.has("finance")) {
    const financeCurrent = Boolean(freshness.get("prices"));
    cards.push({ key: "finance", title: "Финансы", status: financeCurrent ? "normal" : "warning", summary: financeCurrent ? "Баланс по договорам доступен в разрезе валют." : "Проверьте актуальность финансовых данных.", actionLabel: "Открыть финансы", href: available.get("finance")! });
  }
  if (canManageUsers && available.has("company")) cards.push({ key: "company_users", title: "Доступ компании", status: "normal", summary: "Проверьте сотрудников, роли и ожидающие приглашения.", actionLabel: "Управление сотрудниками", href: "/cabinet/company/users" });
  return cards;
}

function buildQuickActions(navigation: WorkspaceNavigationItem[]): WorkspaceQuickActionDto[] {
  const byKey = new Map(navigation.map((item) => [item.key, item]));
  const action = (
    key: string,
    label: string,
    capabilityKey: WorkspaceNavigationItem["key"],
    fallbackHref: string | null = null,
  ): WorkspaceQuickActionDto => {
    const capability = byKey.get(capabilityKey);
    return {
      key,
      label,
      href: capability?.availability === "available" ? capability.href ?? fallbackHref : null,
      availability: capability?.availability === "available" ? "available" : "coming_soon",
    };
  };

  return [
    action("catalog", "Весь каталог", "catalog", "/cabinet/catalog"),
    action("repeat_order", "Повторить заказ", "orders"),
    action("estimate", "Создать смету", "proposals"),
    action("orders", "Мои заказы", "orders"),
    action("shipments", "Планируемые отгрузки", "reservations"),
    action("finance", "Финансы", "finance"),
    action("company_users", "Управление сотрудниками", "company"),
  ].filter((item) => item.availability === "available");
}
