import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OneCServiceHistorySummary } from "../components";
import type { OneCServiceHistoryDetail } from "../types";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260808234500_service_history_completed_work.sql"),
  "utf8",
);

describe("service-history completed work", () => {
  it("shows populated partner-safe work and preserves line breaks", () => {
    const { container } = render(<OneCServiceHistorySummary detail={detail("Тест\nВ ремонте не нуждается")} />);

    expect(screen.getByRole("heading", { name: "Выполненные работы" })).toBeInTheDocument();
    expect(screen.getByText(/Тест\s+В ремонте не нуждается/)).toHaveClass("whitespace-pre-wrap");
    expect(container).not.toHaveTextContent("internal technician note");
  });

  it("omits an empty completed-work section", () => {
    render(<OneCServiceHistorySummary detail={detail(null)} />);
    expect(screen.queryByRole("heading", { name: "Выполненные работы" })).not.toBeInTheDocument();
  });

  it("uses the explicit internal heading without exposing another source field", () => {
    render(<OneCServiceHistorySummary detail={detail("Проверено")} internal />);
    expect(screen.getByRole("heading", { name: "Содержание выполненных работ" })).toBeInTheDocument();
    expect(screen.queryByText("internal technician note")).not.toBeInTheDocument();
  });

  it("adds the scalar only to company-scoped detail projections", () => {
    expect(migration).toContain("'completedWorkSummary', h.completed_work_summary");
    expect(migration).toContain("public.has_permission(h.company_id, 'service.view')");
    expect(migration).not.toContain("source_repair_description',");
    expect(migration).not.toContain("list_partner_service_history");
  });

  it("uses bounded versioned publication and a one-time historical backfill mode", () => {
    expect(migration).toContain("claim_one_c_service_history_sync_v2");
    expect(migration).toContain("publish_one_c_service_history_page_v2");
    expect(migration).toContain("jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 100");
    expect(migration).toContain("completed_work_backfill");
    expect(migration).toContain("min(source_document_date)::date");
    expect(migration).toContain("char_length(completed_work_summary) between 1 and 8000");
  });
});

function detail(completedWorkSummary: string | null): OneCServiceHistoryDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    number: "NSUU-000229",
    date: "2026-07-24T10:00:00Z",
    status: "closed",
    sourceStatus: "Выдан покупателю",
    product: { id: null, sku: "190023", name: "Test", imageUrl: null, href: null },
    maskedSerial: null,
    reportedFault: "Не включается",
    completedWorkSummary,
    resolution: null,
    warrantyState: null,
    warrantyStartDate: null,
    warrantyEndDate: null,
    serviceCenter: null,
    updatedAt: "2026-08-08T08:30:00Z",
    events: [],
  };
}
