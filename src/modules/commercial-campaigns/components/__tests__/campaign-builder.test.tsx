import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignBuilder } from "../CampaignBuilder";
import type { CampaignBuilderOptions, CampaignBuilderProduct } from "../../types";

const mocks = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({ createCampaignDraftAction: mocks.create }));

describe("CampaignBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ success: true, data: { id: "campaign-1" }, message: "ok" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: page([{ ...product("p-26", "260026", "Second page"), categoryId: "cat-other", categoryName: "Видеонаблюдение" }], 2, 101) }) }));
  });

  it("blocks step navigation, explains the first missing field and focuses it", async () => {
    render(<CampaignBuilder options={options()} />);
    await userEvent.click(screen.getByRole("button", { name: "Следующий этап" }));
    expect(screen.getByText("Введите код кампании.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Код кампании/)).toHaveFocus();
    expect(screen.getByRole("button", { name: "Товары" })).toBeDisabled();
  });

  it("preserves cross-page and cross-category selection and validates product limits before audience", async () => {
    const user = userEvent.setup();
    render(<CampaignBuilder options={options()} />);
    await completeBasicStep(user);
    await user.click(screen.getByRole("button", { name: "Следующий этап" }));
    await user.click(screen.getByRole("checkbox", { name: /Выбрать 170030/ }));
    fireEvent.change(screen.getByLabelText("Минимум"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Лимит кампании"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Следующий этап" }));
    expect(screen.getByText("Проверьте минимум и лимит выбранного товара.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Лимит кампании"), { target: { value: "5" } });
    await user.click(screen.getByRole("button", { name: "Следующая страница товаров" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Выбрать 260026/ })).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: /Выбрать 260026/ }));
    await user.click(screen.getByRole("checkbox", { name: "Только выбранные" }));
    expect(screen.getByText(/Dahua AIR SHIELD/)).toBeInTheDocument();
    expect(screen.getByText(/Second page/)).toBeInTheDocument();
    expect(screen.getByText("Выбрано товаров: 2")).toBeInTheDocument();
  });

  it("exposes searchable groups, 100+ results and responsive no-overflow workspace", async () => {
    const user = userEvent.setup();
    const { container } = render(<CampaignBuilder options={options()} />);
    expect(screen.getByRole("button", { name: "Товары" })).toBeInTheDocument();
    expect(container.querySelector(".overflow-hidden")).toBeTruthy();
    await completeBasicStep(user);
    await user.click(screen.getByRole("button", { name: "Следующий этап" }));
    expect(screen.getByText("Найдено: 101")).toBeInTheDocument();
    expect(screen.getByText("Страница 1 из 5")).toBeInTheDocument();
    await user.click(screen.getAllByText("Все группы")[0]);
    await user.type(screen.getByLabelText("Поиск групп"), "Видео");
    expect(screen.getByRole("button", { name: "Видеонаблюдение" })).toBeInTheDocument();
  });

  it("shows warning separately from blockers, supports review fixes and prevents double submit", async () => {
    const user = userEvent.setup();
    const serverIssue = {
      fieldKey: "campaign_period" as const,
      step: 0 as const,
      label: "Период кампании",
      code: "CAMPAIGN_PERIOD_INVALID" as const,
      focusTarget: "campaign-start",
      message: "Проверьте даты начала и окончания.",
    };
    mocks.create.mockResolvedValueOnce({ success: false, data: null, message: serverIssue.message, correlationId: "corr-1", errorCode: serverIssue.code, issues: [serverIssue] });
    render(<CampaignBuilder options={options()} />);
    await reachReview(user);
    expect(screen.getByText("ГОТОВО")).toBeInTheDocument();
    expect(screen.getByText(/Предупреждение:/)).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Создать черновик" });
    expect(create).toBeEnabled();
    await user.dblClick(create);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("ТРЕБУЕТ ВНИМАНИЯ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Исправить" }));
    expect(screen.getByLabelText(/Начало/)).toHaveFocus();
  });

  it("submits one idempotency key and redirects after a successful draft", async () => {
    const user = userEvent.setup();
    render(<CampaignBuilder options={options()} />);
    await reachReview(user);
    await user.dblClick(screen.getByRole("button", { name: "Создать черновик" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/i);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/commercial/campaigns/campaign-1"));
  });
});

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await completeBasicStep(user);
  await user.click(screen.getByRole("button", { name: "Следующий этап" }));
  await user.click(screen.getByRole("checkbox", { name: /Выбрать 170030/ }));
  await user.click(screen.getByRole("button", { name: "Следующий этап" }));
  await user.click(screen.getByRole("checkbox", { name: "PSG" }));
  await user.click(screen.getByRole("button", { name: "Следующий этап" }));
}

async function completeBasicStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Код кампании/), "AIR_SHIELD_2026");
  await user.type(screen.getByLabelText(/Название кампании/), "Dahua Air Shield");
  await user.type(screen.getByLabelText(/Заголовок для партнёра/), "Всегда готов к защите");
  await user.type(screen.getByLabelText(/Описание для партнёра/), "Управляемая кампания Novotech");
  fireEvent.change(screen.getByLabelText(/Начало/), { target: { value: "2026-09-25T10:00" } });
  fireEvent.change(screen.getByLabelText(/Окончание/), { target: { value: "2026-10-25T10:00" } });
  await user.type(screen.getByLabelText(/Краткие условия/), "Текущие условия кампании");
}

function product(id: string, sku: string, name: string): CampaignBuilderProduct { return { id, sku, model: "ARC3000H-FW2", name, imageUrl: null, categoryId: "cat-child", categoryName: "Охранные системы", brandId: "brand-1", brandName: "Dahua", availableQuantity: 12, currentPrice: { amount: 100, currency: "USD" } }; }
function page(items: CampaignBuilderProduct[], pageNumber = 1, totalCount = items.length) { return { items, page: pageNumber, pageSize: 25, totalCount, hasNextPage: pageNumber * 25 < totalCount }; }
function options(): CampaignBuilderOptions { return { initialProductPage: page([product("p-1", "170030", "Dahua AIR SHIELD")], 1, 101), categories: [{ id: "cat-root", parentId: null, name: "Безопасность" }, { id: "cat-child", parentId: "cat-root", name: "Охранные системы" }, { id: "cat-other", parentId: null, name: "Видеонаблюдение" }], brands: [{ id: "brand-1", name: "Dahua" }], companies: [{ id: "company-1", name: "PSG", status: "active" }] }; }
