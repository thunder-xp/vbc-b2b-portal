import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// This runner deliberately accepts only explicitly named, isolated local test databases.
const database = process.argv[2];
if (!database || !/^campaign_special_v2a_[a-z0-9_]+$/.test(database)) {
  throw new Error("Provide an isolated local campaign_special_v2a_* test database; production is forbidden.");
}
const fixture = readFileSync(new URL("./special_offers_bundle_special_price_v2a_runtime.sql", import.meta.url), "utf8");
for (const currency of ["USD", "MDL"]) {
  const input = currency === "USD" ? fixture : fixture.replaceAll("'bundleSpecialCurrency','USD'", "'bundleSpecialCurrency','MDL'");
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_vbc-b2b-portal", "psql", "-U", "supabase_admin", "-d", database, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
  process.stdout.write(`${currency} test-only campaign fixture:\n${result.stdout ?? ""}`);
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
