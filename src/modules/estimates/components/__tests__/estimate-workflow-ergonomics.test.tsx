import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EstimateWorkflowPanel } from "../EstimateWorkflowPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../actions/lifecycle.actions", () => ({
  addEstimateEquipmentToCartAction: vi.fn(),
  createDraftFromEstimateVersionAction: vi.fn(),
  createEstimateVersionAction: vi.fn(),
  duplicateEstimateAction: vi.fn(),
  markEstimateReadyAction: vi.fn(),
  saveEstimateAsTemplateAction: vi.fn(),
}));
vi.mock("../../actions/proposal.actions", () => ({
  generateEstimateVersionPdfAction: vi.fn(),
}));
vi.mock("../../actions/delivery.actions", () => ({
  revokeProposalDeliveryAction: vi.fn(),
  sendEstimateProposalAction: vi.fn(),
}));

describe("EstimateWorkflowPanel ergonomics", () => {
  it("explains immutable versions and renders explicit proposal actions", () => {
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1",
      estimateStatus: "draft",
      acceptedVersionId: null,
      emailDeliveryAvailable: false,
      readiness: { ready: true, checks: [] },
      versions: [{
        id: "version-1",
        versionNumber: 1,
        label: "KP-2026-1 / версия 1",
        status: "prepared",
        statusLabel: "Подготовлено",
        total: "1 000,00 USD",
        currencyCode: "USD",
        note: null,
        createdAt: "2026-07-29T08:00:00Z",
        createdByName: "Менеджер",
        sentAt: null,
        acceptedAt: null,
        rejectedAt: null,
        pdfDocumentId: null,
        pdfStatus: null,
        deliveries: [],
      }],
    }} revision={3} />);

    expect(screen.getByText(/Отправленные и принятые версии неизменяемы/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подготовить коммерческое предложение" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Предпросмотр" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сформировать PDF" })).toBeInTheDocument();
    expect(screen.getByText("Зафиксированная версия")).toBeInTheDocument();
  });

  it("reviews eligible equipment before converting an accepted version", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1",
      estimateStatus: "ready",
      acceptedVersionId: "version-1",
      emailDeliveryAvailable: false,
      readiness: { ready: true, checks: [] },
      versions: [{
        id: "version-1", versionNumber: 1, label: "KP-2026-1 / версия 1", status: "accepted",
        statusLabel: "Принято", total: "1 000,00 USD", currencyCode: "USD", note: null,
        createdAt: "2026-07-29T08:00:00Z", createdByName: "Менеджер", sentAt: null,
        acceptedAt: "2026-07-29T09:00:00Z", rejectedAt: null, pdfDocumentId: "pdf-1",
        pdfStatus: "ready", deliveries: [],
      }],
    }} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Создать заказ" }));
    expect(screen.getByRole("dialog", { name: "Создание заказа" })).toBeInTheDocument();
    expect(screen.getByText(/только позиции оборудования/)).toBeInTheDocument();
    expect(screen.getByText(/заказ в 1С на этом шаге не создаётся/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Создание заказа" })).not.toBeInTheDocument();
  });
});
