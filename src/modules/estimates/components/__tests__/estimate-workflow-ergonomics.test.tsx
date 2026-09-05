import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { generateEstimateVersionPdfAction } from "../../actions/proposal.actions";
import { addEstimateEquipmentToCartAction, createDraftFromEstimateVersionAction } from "../../actions/lifecycle.actions";
import { EstimateWorkflowPanel } from "../EstimateWorkflowPanel";
import { ESTIMATE_DIRTY_STATE_EVENT } from "../estimate-client-events";

const refreshMock = vi.fn();
const fullPermissions = { canManage: true, canSend: true, canConvert: true, canManageOrders: true } as const;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));
vi.mock("../../actions/lifecycle.actions", () => ({
  addEstimateEquipmentToCartAction: vi.fn(),
  createDraftFromEstimateVersionAction: vi.fn(),
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
  it("keeps the just-sent immutable proposal current after its lifecycle-only revision bump", () => {
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1", estimateStatus: "draft", lifecycleStatus: "sent", lifecycleExpiresAt: "2026-09-19T08:00:00Z", acceptedVersionId: null,
      emailDeliveryAvailable: true, readiness: { ready: true, checks: [] },
      guidedState: { state: "awaiting_customer", primaryAction: null, secondaryActions: ["preview", "pdf", "resend", "duplicate", "save_template", "mark_ready", "record_response"], resumeCartId: null }, permissions: fullPermissions,
      customer: { id: "customer-1", displayName: "Customer", primaryEmail: "client@example.com", revision: 1 },
      versions: [{ id: "version-1", estimateNumber: "KP-1", versionNumber: 1, estimateRevision: 3, label: "KP-1", status: "sent", statusLabel: "Sent", total: "100 USD", currencyCode: "USD", note: null, createdAt: "2026-09-05T08:00:00Z", createdByName: "Manager", sentAt: "2026-09-05T08:05:00Z", acceptedAt: null, rejectedAt: null, pdfDocumentId: "pdf-1", pdfStatus: "ready", deliveries: [] }],
    }} revision={4} />);

    expect(screen.getByRole("button", { name: "Отправить повторно" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "КП отправлено" })).toBeInTheDocument();
    expect(screen.queryByText(/Смета изменилась/i)).not.toBeInTheDocument();
  });

  it("disables governed email delivery as soon as the Estimate has unsaved edits", () => {
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1", estimateStatus: "draft", lifecycleStatus: "draft", acceptedVersionId: null,
      emailDeliveryAvailable: true, readiness: { ready: true, checks: [] },
      guidedState: { state: "ready_to_send", primaryAction: "send", secondaryActions: ["preview", "pdf", "duplicate", "save_template", "mark_ready", "mark_sent"], resumeCartId: null }, permissions: fullPermissions,
      customer: { id: "customer-1", displayName: "Customer", primaryEmail: "client@example.com", revision: 1 },
      versions: [{ id: "version-1", estimateNumber: "KP-1", versionNumber: 1, estimateRevision: 3, label: "KP-1", status: "prepared", statusLabel: "Prepared", total: "100 USD", currencyCode: "USD", note: null, createdAt: "2026-09-05T08:00:00Z", createdByName: "Manager", sentAt: null, acceptedAt: null, rejectedAt: null, pdfDocumentId: "pdf-1", pdfStatus: "ready", deliveries: [] }],
    }} revision={3} />);
    const send = screen.getByRole("button", { name: "Отправить клиенту" });
    expect(send).toBeEnabled();
    act(() => window.dispatchEvent(new CustomEvent(ESTIMATE_DIRTY_STATE_EVENT, { detail: { estimateId: "estimate-1", dirty: true } })));
    expect(send).toBeDisabled();
    expect(screen.getByText("Сначала сохраните изменения сметы.")).toBeInTheDocument();
  });
  it("renders proposal actions without exposing snapshot version management", () => {
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1",
      estimateStatus: "draft",
      acceptedVersionId: null,
      emailDeliveryAvailable: false,
      guidedState: { state: "draft", primaryAction: null, secondaryActions: ["preview", "pdf", "send", "duplicate", "save_template", "mark_ready"], resumeCartId: null }, permissions: fullPermissions,
      readiness: { ready: true, checks: [] },
      versions: [{
        id: "version-1",
        versionNumber: 1,
        estimateRevision: 3,
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

    expect(screen.getByRole("heading", { name: "Смета в работе" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Предпросмотр" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сформировать PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/версия/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать новую версию" })).not.toBeInTheDocument();
  });

  it("reviews eligible equipment before converting an accepted version", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    vi.mocked(addEstimateEquipmentToCartAction).mockResolvedValue({ success: true, message: "Added", errorCode: null, data: {
      cartId: "cart-1", added: 1, updated: 0, unavailable: 0, inactive: 0, missingPrice: 0, skipped: 0, changedPrice: 0,
    } });
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1",
      estimateStatus: "ready",
      acceptedVersionId: "version-1",
      emailDeliveryAvailable: false,
      guidedState: { state: "accepted_ready_to_order", primaryAction: "continue_order", secondaryActions: ["preview", "pdf", "duplicate", "save_template"], resumeCartId: null }, permissions: fullPermissions,
      readiness: { ready: true, checks: [] },
      versions: [{
        id: "version-1", versionNumber: 1, label: "KP-2026-1 / версия 1", status: "accepted",
        estimateRevision: 3,
        statusLabel: "Принято", total: "1 000,00 USD", currencyCode: "USD", note: null,
        createdAt: "2026-07-29T08:00:00Z", createdByName: "Менеджер", sentAt: null,
        acceptedAt: "2026-07-29T09:00:00Z", rejectedAt: null, pdfDocumentId: "pdf-1",
        pdfStatus: "ready", deliveries: [],
      }],
    }} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
    expect(screen.getByRole("dialog", { name: "Подготовка корзины к заказу" })).toBeInTheDocument();
    expect(screen.getByText(/только позиции оборудования/)).toBeInTheDocument();
    expect(screen.getByText(/заказ в 1С на этом шаге не создаётся/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Добавить оборудование в корзину" }));
    await waitFor(() => expect(addEstimateEquipmentToCartAction).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
    await user.click(screen.getByRole("button", { name: "Добавить оборудование в корзину" }));
    await waitFor(() => expect(addEstimateEquipmentToCartAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(addEstimateEquipmentToCartAction).mock.calls[0]).toEqual(["estimate-1", "version-1", "version-1"]);
    expect(vi.mocked(addEstimateEquipmentToCartAction).mock.calls[1]).toEqual(["estimate-1", "version-1", "version-1"]);
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
      guidedState: { state: "draft", primaryAction: null, secondaryActions: ["preview", "pdf", "send", "duplicate", "save_template", "mark_ready"], resumeCartId: null }, permissions: fullPermissions,
      versions: [{ id: "version-1", versionNumber: 1, estimateRevision: 3, label: "Proposal", status: "prepared", statusLabel: "Prepared", total: "1 000,00 USD", currencyCode: "USD", note: null, createdAt: "2026-09-02T09:00:00Z", createdByName: "Manager", sentAt: null, acceptedAt: null, rejectedAt: null, pdfDocumentId: null, pdfStatus: null, deliveries: [] }],
    }} revision={3} />);

    const click = user.click(screen.getByRole("button", { name: "Сформировать PDF" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Подготовка");
    expect(screen.getByRole("button", { name: "Подготовка..." })).toBeDisabled();
    resolveGeneration(readyResult);
    await click;
    expect(await screen.findByRole("link", { name: "Скачать PDF" })).toHaveAttribute("href", "/api/estimates/documents/document-1");
    expect(screen.getByRole("button", { name: "Добавить email" })).toBeEnabled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("restores an expired immutable version to the governed draft workflow without exposing resend", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    vi.mocked(createDraftFromEstimateVersionAction).mockResolvedValue({ success: true, message: "Updated", errorCode: null, data: { estimateId: "estimate-1" } });
    render(<EstimateWorkflowPanel initialProposalAction={{ kind: "resend", versionId: "version-1" }} initialWorkflow={{
      estimateId: "estimate-1", estimateStatus: "ready", lifecycleStatus: "expired", lifecycleExpiresAt: "2026-08-20T10:00:00Z",
      acceptedVersionId: null, emailDeliveryAvailable: true, readiness: { ready: true, checks: [] },
      guidedState: { state: "expired", primaryAction: "update", secondaryActions: ["preview", "pdf", "duplicate", "save_template"], resumeCartId: null }, permissions: fullPermissions,
      versions: [{ id: "version-1", versionNumber: 1, estimateRevision: 3, label: "Proposal", status: "sent", statusLabel: "Sent", total: "1 000,00 USD", currencyCode: "USD", note: null, createdAt: "2026-08-01T09:00:00Z", createdByName: "Manager", sentAt: "2026-08-06T10:00:00Z", acceptedAt: null, rejectedAt: null, pdfDocumentId: "pdf-1", pdfStatus: "ready", deliveries: [] }],
    }} revision={3} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Отправить|Добавить email/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Обновить предложение" }));
    await waitFor(() => expect(createDraftFromEstimateVersionAction).toHaveBeenCalledWith("version-1"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows only the latest sent context and mounts complete history on disclosure", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<EstimateWorkflowPanel initialWorkflow={{
      estimateId: "estimate-1", estimateStatus: "ready", lifecycleStatus: "sent", acceptedVersionId: null,
      emailDeliveryAvailable: true, readiness: { ready: true, checks: [] },
      guidedState: { state: "awaiting_customer_opened", primaryAction: null, secondaryActions: ["preview", "pdf", "resend", "delivery_history"], resumeCartId: null }, permissions: fullPermissions,
      versions: [{ id: "version-1", estimateNumber: "KP-1", versionNumber: 1, estimateRevision: 3, label: "KP-1", status: "sent", statusLabel: "Sent", total: "100 USD", currencyCode: "USD", note: null, createdAt: "2026-09-05T08:00:00Z", createdByName: "Manager", sentAt: "2026-09-05T08:05:00Z", acceptedAt: null, rejectedAt: null, pdfDocumentId: "pdf-1", pdfStatus: "ready", deliveries: [
        { id: "delivery-2", recipient: "latest@example.com", status: "delivered", statusLabel: "Delivered", sentAt: "2026-09-05T09:05:00Z", openedAt: "2026-09-05T09:10:00Z", expiresAt: "2026-09-19T09:05:00Z", response: null, failureReason: null },
        { id: "delivery-1", recipient: "older@example.com", status: "sent", statusLabel: "Sent", sentAt: "2026-09-05T08:05:00Z", openedAt: null, expiresAt: "2026-09-19T08:05:00Z", response: null, failureReason: null },
      ] }],
    }} revision={4} />);

    expect(screen.getByRole("heading", { name: "Клиент открыл КП" })).toBeInTheDocument();
    expect(screen.getByText("latest@example.com")).toBeInTheDocument();
    expect(screen.queryByText("older@example.com")).not.toBeInTheDocument();
    expect(screen.queryByTestId("estimate-primary-next-action")).not.toBeInTheDocument();
    await user.click(screen.getByText("История отправок (2)"));
    expect(await screen.findByText(/older@example.com/)).toBeInTheDocument();
    expect(screen.getAllByText(/latest@example.com/)).toHaveLength(2);
  });
});
