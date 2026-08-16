import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PublicRetailSearchForm } from "../components/PublicRetailSearchForm";

describe("public retail discovery architecture", () => {
  it("submits a bounded native catalog search without client hydration", () => {
    render(<PublicRetailSearchForm locale="ru" prominent />);

    expect(screen.getByRole("search")).toHaveAttribute("action", "/catalog");
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
    expect(screen.getByDisplayValue("all")).toHaveAttribute("name", "view");
    expect(readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailSearchForm.tsx"), "utf8")).not.toContain('"use client"');
  });

  it("keeps the installation path informational and free of ungoverned lead mutations", () => {
    const page = readFileSync(join(process.cwd(), "app/installation/page.tsx"), "utf8");
    expect(page).toContain("publicInstallationServiceSchema");
    expect(page).toContain("/calculator/cctv?lang=");
    expect(page).not.toMatch(/server action|supabase|insert\(|live 1C/i);
  });
});
