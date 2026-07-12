import type { OneCEnv } from "../../../lib/env";
import { OneCStockBalanceProvider } from "../providers/one-c";
import { ChunkedStockSyncService, SupabaseStockSyncStore } from "../sync";
export function createChunkedStockSyncService(env:OneCEnv){return new ChunkedStockSyncService(new OneCStockBalanceProvider({baseUrl:env.baseUrl,username:env.username,password:env.password,requestTimeoutMs:env.requestTimeoutMs}),new SupabaseStockSyncStore());}
