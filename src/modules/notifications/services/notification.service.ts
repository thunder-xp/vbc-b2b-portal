import "server-only";

import { MembershipStatus } from "../../access-control/types";
import type { CompanyAccessService } from "../../access-control/services";
import type { NotificationRepository } from "../repositories";
import type {
  NotificationListFilter,
  NotificationPage,
  NotificationSummary,
  PartnerNotification,
} from "../types";

const TIME_ZONE = "Europe/Chisinau";

export class NotificationAccessError extends Error {
  constructor() {
    super("Notification access denied.");
    this.name = "NotificationAccessError";
  }
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly companyAccess: CompanyAccessService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSummary(userId: string): Promise<NotificationSummary> {
    const companyId = await this.resolveCompanyId(userId);
    const summary = await this.repository.getSummary(companyId, 8);
    return { ...summary, items: summary.items.map((item) => this.present(item)) };
  }

  async list(userId: string, filter: NotificationListFilter): Promise<NotificationPage> {
    const companyId = await this.resolveCompanyId(userId);
    const page = await this.repository.list(companyId, filter);
    return { ...page, items: page.items.map((item) => this.present(item)) };
  }

  async markRead(userId: string, notificationId: string): Promise<string> {
    return this.repository.markRead(await this.resolveCompanyId(userId), notificationId);
  }

  async markAllRead(userId: string): Promise<number> {
    return this.repository.markAllRead(await this.resolveCompanyId(userId));
  }

  async dismiss(userId: string, notificationId: string): Promise<string> {
    return this.repository.dismiss(await this.resolveCompanyId(userId), notificationId);
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const membership = (await this.companyAccess.getOwnMemberships(userId))
      .find((item) => item.status === MembershipStatus.Active);
    if (!membership) throw new NotificationAccessError();
    const context = await this.companyAccess.getActiveCompanyContext(userId, membership.companyId);
    return context.company.id;
  }

  private present(item: PartnerNotification): PartnerNotification {
    return {
      ...item,
      relativeTime: formatRelativeTime(item.occurredAt, this.now()),
    };
  }
}

export function formatRelativeTime(value: string, now: Date): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "";
  const minutes = Math.round((timestamp.getTime() - now.getTime()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("ru-MD", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  return new Intl.DateTimeFormat("ru-MD", {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(timestamp);
}

