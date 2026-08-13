import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260813071055_publish_default_retail_installation_tariffs.sql"), "utf8");

describe("default Retail installation tariffs migration", () => {
  it("publishes only the four approved VAT-included MDL rates", () => {
    expect(migration).toContain("'MDL', 'included'");
    expect(migration).toContain("'camera_installation', 'piece', 600.00");
    expect(migration).toContain("'cable_laying', 'meter', 35.00");
    expect(migration).toContain("'commissioning', 'piece', 250.00");
    expect(migration).toContain("'remote_configuration', 'service', 150.00");
    expect(migration.match(/v_tariff_set_id, '(camera_installation|cable_laying|commissioning|remote_configuration)'/g)).toHaveLength(4);
  });

  it("uses the governed versioned lifecycle with an internal audit actor", () => {
    expect(migration).toContain("internal_user_role_assignments");
    expect(migration).toContain("role.code = 'novotech_admin'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'tariff_superseded'");
    expect(migration).toContain("'tariff_published'");
  });
});
