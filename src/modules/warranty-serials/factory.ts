import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { createCompanyAccessService } from "@/src/modules/access-control/actions/service-factory";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { OneCWarrantySerialProvider } from "./one-c-warranty-serial.provider";
import { WarrantySerialRepository } from "./repository";
import { WarrantySerialService } from "./service";
import { WarrantySerialSyncService } from "./sync.service";

export function createWarrantySerialSyncService() {
  const env = getOneCEnv();
  const client = new OneCODataClient({ baseUrl: env.baseUrl, username: env.username, password: env.password, requestTimeoutMs: env.requestTimeoutMs });
  return new WarrantySerialSyncService(new OneCWarrantySerialProvider(client), new WarrantySerialRepository());
}

export function createWarrantySerialService() {
  return new WarrantySerialService(new WarrantySerialRepository(), createCompanyAccessService());
}
