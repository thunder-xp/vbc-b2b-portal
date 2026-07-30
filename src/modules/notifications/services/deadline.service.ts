import "server-only";

import type {
  NotificationDeadlineRepository,
  NotificationDeadlineResult,
} from "../repositories";

const BUSINESS_TIME_ZONE = "Europe/Chisinau";

export class NotificationDeadlineService {
  constructor(
    private readonly repository: NotificationDeadlineRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  run(): Promise<NotificationDeadlineResult> {
    return this.repository.generate(businessDate(this.now()));
  }
}

export function businessDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(now);
}
