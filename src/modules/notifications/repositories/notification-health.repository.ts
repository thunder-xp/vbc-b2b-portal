import type { NotificationHealth } from "../types";

export interface NotificationHealthRepository {
  getHealth(): Promise<NotificationHealth>;
}

