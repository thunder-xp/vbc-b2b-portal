import { loadEnvConfig } from "@next/env";

import { getOneCEnv, getSupabaseEnvStatus } from "@/src/lib/env";
import {
  CounterpartyDirectorySyncService,
  OneCCounterpartyDirectorySource,
} from "@/src/modules/onboarding/services";

async function main(): Promise<void> {
  loadEnvConfig(
    process.env.NOVOTECH_ENV_DIR?.trim() || process.cwd(),
    process.env.NODE_ENV !== "production",
  );

  const supabase = getSupabaseEnvStatus();
  if (!supabase.configured) {
    throw new Error(`Missing required environment variables: ${supabase.missing.join(", ")}`);
  }

  const oneC = getOneCEnv();
  if (!oneC.baseUrl || !oneC.username || !oneC.password || oneC.authMode !== "basic") {
    throw new Error("Production 1C Basic Auth configuration is incomplete.");
  }
  if (oneC.useMockPartners) {
    throw new Error("Counterparty directory synchronization cannot run in mock mode.");
  }

  const result = await new CounterpartyDirectorySyncService(
    new OneCCounterpartyDirectorySource(oneC),
  ).synchronize();

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "one_c_counterparty_directory_cli_failed",
    errorType: error instanceof Error ? error.name : typeof error,
    safeMessage: error instanceof Error ? error.message : "Unknown synchronization failure.",
  }));
  process.exitCode = 1;
});
