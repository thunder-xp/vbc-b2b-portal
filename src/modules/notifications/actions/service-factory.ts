import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseNotificationRepository } from "../repositories";
import { NotificationService } from "../services";

export function createNotificationService(): NotificationService {
  return new NotificationService(
    new SupabaseNotificationRepository(),
    createCompanyAccessService(),
  );
}

