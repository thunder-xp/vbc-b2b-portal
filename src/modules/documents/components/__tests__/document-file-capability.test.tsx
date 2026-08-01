import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PartnerDocumentDetail, PartnerDocumentListItem } from "../../types";
import { DocumentCard } from "../DocumentCard";
import { DocumentDetail } from "../DocumentDetail";

describe("document file capability", () => {
  it("shows posted metadata honestly without a download action", () => {
    render(<DocumentCard document={item()} />);
    expect(screen.getByText("Проведён")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Скачать/ })).not.toBeInTheDocument();
  });

  it("shows the safe unavailable state on metadata-only detail", () => {
    render(<DocumentDetail document={{ ...item(), description: null, sourceSystem: "onec", publishedAt: null, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" } satisfies PartnerDocumentDetail} />);
    expect(screen.getByText("Файл пока недоступен")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Скачать документ/ })).not.toBeInTheDocument();
  });
});

function item(): PartnerDocumentListItem {
  return { id: "11111111-1111-4111-8111-111111111111", documentType: "fiscal_invoice", title: "Счёт-фактура № NS-1", documentNumber: "NS-1", issueDate: "2026-08-01", validFrom: null, validUntil: null, status: "available", version: "v1", languageCode: "ru", fileName: null, mimeType: null, fileSize: null, isCurrent: true, sourceScope: "company_specific", products: [], orders: [] };
}
