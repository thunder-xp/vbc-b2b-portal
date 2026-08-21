import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { getEstimatesCopy } from "@/src/modules/partner-locale";

const page = readFileSync(join(process.cwd(), "app/(partner)/cabinet/nomenclature/page.tsx"), "utf8");
const workspace = readFileSync(join(process.cwd(), "src/modules/estimates/components/PartnerNomenclatureWorkspace.tsx"), "utf8");

describe("partner nomenclature workspace", () => {
  it("uses one bounded server action with search, type filter and pagination", () => {
    expect(page).toContain("listPartnerNomenclatureAction");
    expect(page).toContain("search: query.search, itemType");
    expect(page).toContain("NumberedPagination");
    expect(page).not.toMatch(/createClient|supabase|fetch\(/);
  });

  it("supports the three governed types without fake catalog or 1C fields", () => {
    expect(workspace).toContain("copy.equipmentType");
    expect(workspace).toContain("copy.materialType");
    expect(workspace).toContain("copy.serviceType");
    expect(getEstimatesCopy("ru")).toMatchObject({ equipmentType: "Оборудование", materialType: "Материал", serviceType: "Работа / услуга" });
    expect(getEstimatesCopy("ro")).toMatchObject({ equipmentType: "Echipament", materialType: "Material", serviceType: "Lucrare / serviciu" });
    expect(workspace).not.toMatch(/Ref_Key|SKU|Остаток|Гарантия/);
  });

  it("keeps mobile rendering bounded and uses governed mutations", () => {
    expect(workspace).toContain("lg:hidden");
    expect(workspace).toContain("min-w-0");
    expect(workspace).toContain("createPartnerNomenclatureAction");
    expect(workspace).toContain("updatePartnerNomenclatureAction");
    expect(workspace).toContain("archivePartnerNomenclatureAction");
  });
});
