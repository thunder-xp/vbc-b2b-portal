import type { NotificationHealth } from "../types";

export interface NotificationHealthRepository {
  getHealth(): Promise<NotificationHealth>;
  retryDelivery(deliveryId: string): Promise<boolean>;
}

