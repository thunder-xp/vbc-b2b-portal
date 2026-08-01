import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DocumentHealth } from "../../types";
import { DocumentHealthView } from "../AdminDocumentCenter";

describe("DocumentHealthView", () => {
  it("shows verified source and safe mapping diagnostics", () => {
    render(<DocumentHealthView health={health()} />);
    expect(screen.getByText("Document_СчетФактура")).toBeInTheDocument();
    expect(screen.getByText("Сопоставлено с компанией")).toBeInTheDocument();
    expect(screen.getByText("Без компании")).toBeInTheDocument();
    expect(screen.getByText("configured")).toBeInTheDocument();
    expect(screen.getByText(/не подтверждено/)).toBeInTheDocument();
  });
});

function health(): DocumentHealth {
  return { totalMetadata: 12, availableFiles: 2, missingFiles: 10, expired: 0, superseded: 0, unlinkedOrderDocuments: 2, unlinkedProductDocuments: 0, downloadFailures: 0, syncState: { status: "succeeded", provider_status: "configured", last_successful_at: "2026-08-01T10:00:00Z", safe_error_code: null, rows_published: 10, mapped_companies: 8, unmapped_companies: 2, source_stats: { Document_СчетФактура: { received: 5, staged: 5, rejected: 0 } } } };
}
