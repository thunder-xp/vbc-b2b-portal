export type NotificationDeadlineResult = {
  runId: string;
  status: "succeeded" | "locked";
  businessDate?: string;
  sourceEventsProcessed?: number;
  recipientsResolved?: number;
  notificationsCreated?: number;
  deduplicated?: number;
};

export interface NotificationDeadlineRepository {
  generate(businessDate: string): Promise<NotificationDeadlineResult>;
}
