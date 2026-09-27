import { loadEnvConfig } from "@next/env";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const [{ getOneCCommercialRatesEnv }, { createExchangeRateSyncService }] = await Promise.all([
    import("../src/lib/env"),
    import("../src/modules/integration/services"),
  ]);
  const result = await createExchangeRateSyncService(getOneCCommercialRatesEnv()).sync();
  console.log(JSON.stringify({ outcome: result.outcome, publishedCount: result.publishedCount, checkedAt: result.checkedAt }));
}

main().catch((error: unknown) => {
  console.error(`Commercial exchange-rate sync failed: ${error instanceof Error ? error.name : "UnknownError"}`);
  process.exitCode = 1;
});
