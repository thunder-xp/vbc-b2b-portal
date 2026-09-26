import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminActionCenter } from "../../types";
import { AdminActionCenterView } from "../AdminActionCenterView";

const empty: AdminActionCenter = {
  items: [], actionableCount: 0, waitingCount: 0, hasMore: false,
  generatedAt: "2026-09-26T12:00:00.000Z", sourceWarnings: [],
};

describe("AdminActionCenterView", () => {
  it("renders the required empty success state", () => {
    render(<AdminActionCenterView center={empty} />);
    expect(screen.getByRole("heading", { name: "Требует внимания" })).toBeInTheDocument();
    expect(screen.getByText("Нет задач, требующих вашего внимания.")).toBeInTheDocument();
  });

  it("shows a human explanation, age and canonical primary action", () => {
    render(<AdminActionCenterView center={{
      ...empty, actionableCount: 1,
      items: [{
        id: "agent:one", domain: "agent", kind: "agent_application", level: "ACTION_REQUIRED",
        title: "Заявка коммерческого агента",
        explanation: "Получена заявка от «Анна Попеску». Нужно проверить данные и принять решение.",
        entityLabel: "Анна Попеску", createdAt: "2026-09-24T12:00:00.000Z",
        actionLabel: "Рассмотреть заявку", actionHref: "/admin/agents/applications/application-1",
        permission: "admin.agents.manage",
      }],
    }} />);
    expect(screen.getByText("Требует действия")).toBeInTheDocument();
    expect(screen.getByText("Ожидает: 2 дня")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Рассмотреть заявку" })).toHaveAttribute(
      "href", "/admin/agents/applications/application-1",
    );
  });

  it("shows a safe partial-data warning without hiding the success state", () => {
    render(<AdminActionCenterView center={{
      ...empty, sourceWarnings: [{ source: "service", label: "Сервис" }],
    }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Часть данных временно недоступна: Сервис.");
    expect(screen.getByText("Нет задач, требующих вашего внимания.")).toBeInTheDocument();
  });
});
