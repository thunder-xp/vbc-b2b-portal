import type {
  GlobalOrderHistoryAnalyticsRepository,
  GlobalOrderProductMembershipPage,
} from "../repositories";

export class GlobalOrderHistoryAnalyticsService {
  constructor(private readonly repository: GlobalOrderHistoryAnalyticsRepository) {}

  async getOrderProductMembershipPage(input: {
    dateFrom: string;
    dateTo: string;
    afterOrderDate?: string | null;
    afterOrderHistoryId?: string | null;
    limit?: number;
  }): Promise<GlobalOrderProductMembershipPage> {
    return this.repository.getOrderProductMembershipPage(input);
  }
}
