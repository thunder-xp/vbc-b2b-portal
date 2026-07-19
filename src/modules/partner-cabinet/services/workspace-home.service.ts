import { InvalidStateError } from "../../access-control/services";
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
  emptyMessage: string;
  actionLabel: string;
};

export type WorkspaceHomeDto = {
  greetingName: string;
  company: {
    name: string;
    role: string;
    external1cCode: string;
    priceType: string;
    accountManager: string | null;
  };
  quickActions: WorkspaceQuickActionDto[];
  processCards: WorkspaceProcessCardDto[];
  commercialConfigurationMissing: boolean;
};

export interface WorkspaceHomeService {
  getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto>;
}

export class DefaultWorkspaceHomeService implements WorkspaceHomeService {
  constructor(
    private readonly workspaceContextService: PartnerWorkspaceContextService,
  ) {}

  async getWorkspaceHome(userId: string): Promise<WorkspaceHomeDto> {
    const context = await this.workspaceContextService.getWorkspaceContext(userId);
    if (context.accessState !== "active" && context.accessState !== "missing_price_type") {
      throw new InvalidStateError("Partner workspace access is not active.");
    }

    return {
      greetingName: context.userDisplayName,
      company: {
        name: context.companyName ?? "Компания не найдена",
        role: context.membershipRole ?? "Не определена",
        external1cCode: context.external1cCode ?? "Не указан",
        priceType: context.priceTypeName ?? (context.external1cPriceTypeId ? "Назначен" : "Не настроен"),
        accountManager: null,
      },
      quickActions: buildQuickActions(context.capabilities.navigation),
      processCards: WORKSPACE_PROCESS_CARDS,
      commercialConfigurationMissing: context.accessState === "missing_price_type",
    };
  }
}

const WORKSPACE_PROCESS_CARDS: WorkspaceProcessCardDto[] = [
  { key: "projects", title: "Мои проекты", emptyMessage: "Проекты пока не созданы.", actionLabel: "Создать первый проект" },
  { key: "orders", title: "Заказы", emptyMessage: "Заказов пока нет.", actionLabel: "Перейти к каталогу" },
  { key: "proposals", title: "Сметы и КП", emptyMessage: "Сметы и коммерческие предложения пока не созданы.", actionLabel: "Сформировать первое КП" },
  { key: "service", title: "Сервисные обращения", emptyMessage: "Активных сервисных обращений нет.", actionLabel: "Зарегистрировать гарантийный случай" },
  { key: "attention", title: "Требует внимания", emptyMessage: "Нет задач, требующих вашего внимания.", actionLabel: "Всё в порядке" },
  { key: "activity", title: "Последние действия", emptyMessage: "История действий пока пуста.", actionLabel: "Действия появятся после начала работы" },
];

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
    action("create_project", "Создать проект", "projects"),
    action("select_equipment", "Подобрать оборудование", "catalog", "/cabinet/catalog"),
    action("create_specification", "Создать спецификацию", "projects"),
    action("create_proposal", "Сформировать КП", "proposals"),
    action("repeat_order", "Повторить заказ", "orders"),
    action("register_warranty", "Зарегистрировать гарантийный случай", "warranty"),
  ];
}
