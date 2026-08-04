import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("../actions", () => ({ createSupportTicketAction: vi.fn(), addSupportReplyAction: vi.fn(), partnerSupportTransitionAction: vi.fn(), transitionSupportTicketAction: vi.fn() }));
import { SupportTicketForm } from "../components";
import { SupportDashboardBlock } from "../SupportDashboardBlock";

describe("partner support UI", () => {
  it("asks only for the problem, priority, and optional evidence", () => { const { container } = render(<SupportTicketForm idempotencyKey="11111111-1111-1111-1111-111111111111" />); expect(screen.getByLabelText("Опишите проблему")).toHaveAttribute("minlength", "20"); expect(screen.getByLabelText("Приоритет")).toHaveValue("medium"); expect(screen.getByLabelText("Приложение (необязательно)")).toBeInTheDocument(); expect(screen.queryByLabelText(/email|компания|телефон|имя/i)).not.toBeInTheDocument(); expect(container.querySelectorAll("input[type=hidden]")).toHaveLength(1); });
  it("has accessible priority explanations and a 44px submit target", () => { render(<SupportTicketForm idempotencyKey="11111111-1111-1111-1111-111111111111" />); expect(screen.getByRole("button", { name: "Отправить заявку" })).toHaveClass("min-h-11"); expect(screen.getByText(/Высокий — работа заблокирована/)).toBeInTheDocument(); });
  it("bounds the dashboard block to two actionable tickets", () => { const item = (id: string) => ({ id, ticketNumber: `SUP-2026-${id}`, status: "waiting_for_partner" as const, updatedAt: "2026-08-03T10:00:00Z", nextAction: "Добавьте информацию", href: `/cabinet/support/${id}` }); render(<SupportDashboardBlock items={[item("1"), item("2"), item("3")]} />); expect(screen.getAllByRole("link", { name: "Открыть заявку" })).toHaveLength(2); expect(screen.queryByText("SUP-2026-3")).not.toBeInTheDocument(); });
});
