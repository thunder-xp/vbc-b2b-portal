import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { generateEstimateVersionPdfAction } from "../../actions/proposal.actions";
import { EstimateWorkflowPanel } from "../EstimateWorkflowPanel";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));
vi.mock("../../actions/lifecycle.actions", () => ({
  addEstimateEquipmentToCartAction: vi.fn(),
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
  it("renders proposal actions without exposing snapshot version management", () => {
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

    expect(screen.getByRole("heading", { name: "Отправка и статус" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Предпросмотр" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сформировать PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/версия/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать новую версию" })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Продолжить оформление" }));
    expect(screen.getByRole("dialog", { name: "Подготовка корзины к заказу" })).toBeInTheDocument();
    expect(screen.getByText(/только позиции оборудования/)).toBeInTheDocument();
    expect(screen.getByText(/заказ в 1С на этом шаге не создаётся/i)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Создание заказа" })).not.toBeInTheDocument();
  });

  it("acknowledges generation immediately and exposes the ready artifact without an RSC refresh", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    let resolveGeneration!: (value: Awaited<ReturnType<typeof generateEstimateVersionPdfAction>>) => void;
    vi.mocked(generateEstimateVersionPdfAction).mockReturnValue(new Promise((resolve) => { resolveGeneration = resolve; }));
    const readyResult = { success: true, message: "Ready", errorCode: null, data: {
      id: "document-1", companyId: "company-1", estimateId: "estimate-1", estimateRevision: 3, versionId: "version-1", templateId: null,
      generationFingerprint: "fingerprint", status: "ready", storageBucket: "estimate-proposals", storageKey: "company-1/document-1.pdf",
      pageCount: 1, fileSizeBytes: 1234, checksumSha256: "checksum", safeError: null, createdAt: "2026-09-02T10:00:00Z",
    } } satisfies Awaited<ReturnType<typeof generateEstimateVersionPdfAction>>;

    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1", estimateStatus: "draft", lifecycleStatus: "draft", lifecycleExpiresAt: null,
      acceptedVersionId: null, emailDeliveryAvailable: true, readiness: { ready: true, checks: [] },
      versions: [{ id: "version-1", versionNumber: 1, label: "Proposal", status: "prepared", statusLabel: "Prepared", total: "1 000,00 USD", currencyCode: "USD", note: null, createdAt: "2026-09-02T09:00:00Z", createdByName: "Manager", sentAt: null, acceptedAt: null, rejectedAt: null, pdfDocumentId: null, pdfStatus: null, deliveries: [] }],
    }} revision={3} />);

    const click = user.click(screen.getByRole("button", { name: "Сформировать PDF" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Подготовка");
    expect(screen.getByRole("button", { name: "Подготовка..." })).toBeDisabled();
    resolveGeneration(readyResult);
    await click;
    expect(await screen.findByRole("link", { name: "Скачать PDF" })).toHaveAttribute("href", "/api/estimates/documents/document-1");
    expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
