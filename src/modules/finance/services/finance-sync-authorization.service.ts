import type { UserProfileService } from "../../access-control/services";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import type { FinanceRepository } from "../repositories";

export class FinanceSyncAuthorizationService {
  constructor(private readonly profileService: UserProfileService, private readonly repository: FinanceRepository) {}

  async ensureAllowed(userId: string): Promise<void> {
    const profile = await this.profileService.ensureActiveUser(userId);
    if (profile.userType !== UserType.Admin && profile.userType !== UserType.Internal) throw new ForbiddenError();
    if (!await this.repository.canRunFinanceSync()) throw new ForbiddenError();
  }
}
