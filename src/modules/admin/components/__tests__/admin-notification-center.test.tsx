import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  AdminActionCenter,
  AdminActionDomain,
  AdminActionItem,
  AdminActionLevel,
} from "../../types";
import { AdminNotificationCenter } from "../AdminNotificationCenter";

const generatedAt = "2026-09-26T12:00:00.000Z";

const center: AdminActionCenter = {
  actionableCount: 2,
  generatedAt,
  hasMore: false,
  items: [
    item("integration", "CRITICAL", "integration", "2026-09-26T10:00:00.000Z"),
    item("service", "ACTION_REQUIRED", "service", "2026-09-26T08:00:00.000Z"),
    item("agent", "WAITING", "agent", "2026-09-26T11:00:00.000Z"),
    item("onboarding", "INFO", "onboarding", "2026-09-26T09:00:00.000Z"),
  ],
  sourceWarnings: [],
  waitingCount: 1,
};

describe("AdminNotificationCenter", () => {
  it("shows an active-attention badge and opens a bounded notification drawer", () => {
    render(<AdminNotificationCenter center={center} />);
    const trigger = screen.getByRole("button", {
      name: "Центр уведомлений: требуют внимания 2",
    });
    expect(trigger.querySelector("span")).toHaveTextContent("2");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Центр уведомлений" });
    expect(dialog).toHaveClass("w-full", "sm:w-[34rem]");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(4);
  });

  it("filters by active attention and only exposes available source filters", () => {
    render(<AdminNotificationCenter center={center} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Требуют внимания" }));
    expect(situationOrder()).toEqual([
      "integration:integration",
      "service:service",
    ]);

    const source = screen.getByRole("combobox", { name: "Источник уведомлений" });
    expect(within(source).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Все источники",
      "Партнёры",
      "Агенты",
      "Сервис",
      "Интеграции",
    ]);
    fireEvent.change(source, { target: { value: "service" } });
    expect(situationOrder()).toEqual(["service:service"]);
  });

  it("sorts deterministically by priority, newest and longest waiting", () => {
    render(<AdminNotificationCenter center={center} />);
    open();
    expect(situationOrder()).toEqual([
      "integration:integration",
      "service:service",
      "agent:agent",
      "onboarding:onboarding",
    ]);

    const sort = screen.getByRole("combobox", { name: "Сортировка уведомлений" });
    fireEvent.change(sort, { target: { value: "newest" } });
    expect(situationOrder()).toEqual([
      "agent:agent",
      "integration:integration",
      "onboarding:onboarding",
      "service:service",
    ]);
    fireEvent.change(sort, { target: { value: "oldest" } });
    expect(situationOrder()).toEqual([
      "service:service",
      "onboarding:onboarding",
      "integration:integration",
      "agent:agent",
    ]);
  });

  it("keeps the canonical domain action and closes on Escape", () => {
    render(<AdminNotificationCenter center={center} />);
    const trigger = screen.getByRole("button", {
      name: "Центр уведомлений: требуют внимания 2",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("link", { name: "Открыть service" })).toHaveAttribute(
      "href",
      "/admin/service/service",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

function open() {
  fireEvent.click(screen.getByRole("button", {
    name: "Центр уведомлений: требуют внимания 2",
  }));
}

function situationOrder(): string[] {
  return screen.getAllByRole("listitem").map((element) =>
    element.getAttribute("data-situation-key") ?? ""
  );
}

function item(
  id: string,
  level: AdminActionLevel,
  domain: AdminActionDomain,
  createdAt: string,
): AdminActionItem {
  return {
    actionHref: "/admin/" + domain + "/" + id,
    actionLabel: "Открыть " + id,
    createdAt,
    domain,
    entityLabel: "Объект " + id,
    explanation: "Краткое объяснение " + id,
    id: domain + ":" + id,
    kind: domain === "integration"
      ? "operational_issue"
      : domain === "service"
        ? "service_attention"
        : domain === "agent"
          ? "agent_application"
          : "partner_review",
    level,
    permission: "admin.dashboard.view",
    signalCount: 1,
    situationKey: domain + ":" + id,
    title: "Ситуация " + id,
  };
}
