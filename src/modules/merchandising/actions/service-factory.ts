import "server-only";

import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseMerchandisingRepository } from "../repositories";
import { MerchandisingService } from "../services";

export function createMerchandisingService(): MerchandisingService {
  return new MerchandisingService(
    new SupabaseMerchandisingRepository(),
    createCompanyAccessService(),
  );
}
