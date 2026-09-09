import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveEstimateAction, deleteArchivedEstimateAction } from "../../actions/estimate.actions";
import { duplicateEstimateAction } from "../../actions/lifecycle.actions";
import { PartnerLocaleProvider } from "../../../partner-locale";
import { EstimateListActions } from "../EstimateListActions";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions/estimate.actions", () => ({ archiveEstimateAction: vi.fn(), deleteArchivedEstimateAction: vi.fn() }));
vi.mock("../../actions/lifecycle.actions", () => ({ duplicateEstimateAction: vi.fn() }));

describe("EstimateListActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links directly to the latest ready PDF", () => {
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId="document-1" revision={3} />);
    expect(screen.getByRole("link", { name: "Открыть последний PDF" })).toHaveAttribute("href", "/api/estimates/documents/document-1");
  });

  it("duplicates and archives through confirmation while preserving history copy", async () => {
    const user = userEvent.setup();
    vi.mocked(duplicateEstimateAction).mockResolvedValue({ success: true, data: { estimateId: "copy-1" }, message: "Копия создана", errorCode: null });
    vi.mocked(archiveEstimateAction).mockResolvedValue({ success: true, data: null, message: "Архивировано", errorCode: null });
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Дублировать" }));
    expect(duplicateEstimateAction).toHaveBeenCalledWith("estimate-1");
    expect(push).toHaveBeenCalledWith("/cabinet/estimates/copy-1");
    await user.click(screen.getByRole("button", { name: "Архивировать смету" }));
    expect(screen.getByRole("dialog", { name: "Архивировать смету?" })).toHaveTextContent("Смета будет перемещена в архив. История и связанные документы сохранятся.");
    expect(archiveEstimateAction).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Архивировать смету" })[1]);
    expect(archiveEstimateAction).toHaveBeenCalledWith("estimate-1", 3);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps archive confirmation open and displays a failed operation", async () => {
    const user = userEvent.setup();
    vi.mocked(archiveEstimateAction).mockResolvedValue({ success: false, data: null, message: "safe fallback", errorCode: "INVALID_STATE" });
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Архивировать смету" }));
    await user.click(screen.getAllByRole("button", { name: "Архивировать смету" })[1]);

    expect(screen.getByRole("alert")).toHaveTextContent("Действие не выполнено. Обновите данные и повторите попытку.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("exposes governed deletion only for archived estimates", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteArchivedEstimateAction).mockResolvedValue({ success: true, data: null, message: "Удалено", errorCode: null });
    render(<div data-estimate-row-id="estimate-1"><EstimateListActions archived canDeleteArchived estimateId="estimate-1" latestPdfDocumentId={null} revision={3} /></div>);
    expect(screen.queryByRole("button", { name: "Архивировать смету" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить смету" }));
    expect(screen.getByRole("dialog", { name: "Удалить архивную смету?" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Смета исчезнет из рабочего архива. История предложений, заказов и связанные записи сохранятся.");
    await user.click(screen.getAllByRole("button", { name: "Удалить смету" })[1]);
    expect(deleteArchivedEstimateAction).toHaveBeenCalledWith("estimate-1", 3, expect.any(String));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('[data-estimate-row-id="estimate-1"]')).toHaveAttribute("hidden");
  });

  it("keeps the modal open and shows the specific protected-proposal rejection", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteArchivedEstimateAction).mockResolvedValue({ success: false, data: null, message: "safe server fallback", errorCode: "ESTIMATE_DELETE_PROTECTED_PROPOSAL" });
    render(<EstimateListActions archived canDeleteArchived estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Удалить смету" }));
    await user.click(screen.getAllByRole("button", { name: "Удалить смету" })[1]);

    expect(screen.getByRole("alert")).toHaveTextContent("Эту смету нельзя удалить: по ней уже было отправлено коммерческое предложение.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders typed rejection copy in Romanian", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteArchivedEstimateAction).mockResolvedValue({ success: false, data: null, message: "safe server fallback", errorCode: "ESTIMATE_DELETE_PROTECTED_ORDER" });
    render(<PartnerLocaleProvider locale="ro"><EstimateListActions archived canDeleteArchived estimateId="estimate-1" latestPdfDocumentId={null} revision={3} /></PartnerLocaleProvider>);

    await user.click(screen.getByRole("button", { name: "Șterge devizul" }));
    await user.click(screen.getAllByRole("button", { name: "Șterge devizul" })[1]);

    expect(screen.getByRole("alert")).toHaveTextContent("Acest deviz nu poate fi șters: este asociat unei comenzi.");
  });

  it("does not expose deletion for active estimates", () => {
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);
    expect(screen.queryByRole("button", { name: "Удалить смету" })).not.toBeInTheDocument();
  });

  it("shows a deterministic disabled delete action when the actor is neither creator nor owner", () => {
    render(<EstimateListActions archived canDeleteArchived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);
    const button = screen.getByRole("button", { name: "Удалить смету" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Удалить может создатель сметы или владелец компании.");
    expect(screen.getByRole("tooltip", { name: "Удалить может создатель сметы или владелец компании." })).toBeInTheDocument();
  });

  it("renders Romanian archive and disabled-delete lifecycle copy", async () => {
    const user = userEvent.setup();
    render(<PartnerLocaleProvider locale="ro"><EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} /></PartnerLocaleProvider>);
    await user.click(screen.getByRole("button", { name: "Arhivează devizul" }));
    expect(screen.getByRole("dialog", { name: "Arhivați devizul?" })).toHaveTextContent("Devizul va fi mutat în arhivă. Istoricul și documentele asociate se păstrează.");

    render(<PartnerLocaleProvider locale="ro"><EstimateListActions archived canDeleteArchived={false} estimateId="estimate-2" latestPdfDocumentId={null} revision={2} /></PartnerLocaleProvider>);
    expect(screen.getByRole("button", { name: "Șterge devizul" })).toHaveAttribute("title", "Devizul poate fi șters de creator sau de proprietarul companiei.");
  });
});
