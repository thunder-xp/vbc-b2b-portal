import { loadEnvConfig } from "@next/env";

import {
  PublicRetailPublicationService,
  SupabasePublicRetailPublicationRepository,
} from "@/src/modules/public-retail";

async function main() {
  loadEnvConfig(process.env.NOVOTECH_ENV_DIR?.trim() || process.cwd(), process.env.NODE_ENV !== "production");
  const result = await new PublicRetailPublicationService(
    new SupabasePublicRetailPublicationRepository(),
  ).publishCurrentProjection();
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "public_retail_publication_failed",
    errorType: error instanceof Error ? error.name : typeof error,
  }));
  process.exitCode = 1;
});
