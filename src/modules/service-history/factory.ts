import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { createCompanyAccessService } from "@/src/modules/access-control/actions/service-factory";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { OneCServiceHistoryProvider, OneCServiceSerialProvider } from "./one-c-service-history.provider";
import { ServiceHistoryRepository } from "./repository";
import { ServiceHistoryService } from "./service";
import { ServiceHistorySyncService } from "./sync.service";

export function createServiceHistorySyncService() {
  const env = getOneCEnv();
  const client = new OneCODataClient({ baseUrl: env.baseUrl, username: env.username, password: env.password, requestTimeoutMs: env.requestTimeoutMs });
  return new ServiceHistorySyncService(new OneCServiceHistoryProvider(client), new ServiceHistoryRepository(), new OneCServiceSerialProvider(client));
}
export function createServiceHistoryService() { return new ServiceHistoryService(new ServiceHistoryRepository(), createCompanyAccessService()); }
