import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({ recorded: true }),
  recordBatch: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock("../../actions", () => ({
  recordBehaviorEventAction: mocks.record,
  recordBehaviorEventsAction: mocks.recordBatch,
}));

import {
  BehaviorTrackedCatalogLink,
  BehaviorViewEvent,
  recordBehaviorInteraction,
  scheduleBehaviorInteraction,
} from "../BehaviorViewEvent";

describe("BehaviorViewEvent", () => {
  beforeEach(() => {
    mocks.record.mockClear();
    mocks.recordBatch.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates hydration and rerenders within one session", async () => {
    const view = render(
      <BehaviorViewEvent
        dedupeKey="catalog:all"
        eventName="catalog_viewed"
        route="/cabinet/catalog"
      />,
    );
    await waitFor(() => expect(mocks.recordBatch).toHaveBeenCalledTimes(1));
    view.rerender(
      <BehaviorViewEvent
        dedupeKey="catalog:all"
        eventName="catalog_viewed"
        route="/cabinet/catalog"
      />,
    );
    await Promise.resolve();
    expect(mocks.recordBatch).toHaveBeenCalledTimes(1);
  });

  it("records dashboard and momentum views through one request", async () => {
    render(
      <BehaviorViewEvent
        additionalEvents={[{
          dedupeKey: "momentum:fingerprint-1",
          eventName: "momentum_prompt_viewed",
          metadataSafe: { status_band: "growing" },
          route: "/cabinet",
          sourceSurface: "partner_momentum",
        }]}
        dedupeKey="dashboard"
        eventName="partner_dashboard_viewed"
        route="/cabinet"
      />,
    );

    await waitFor(() => expect(mocks.recordBatch).toHaveBeenCalledTimes(1));
    expect(mocks.recordBatch.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.recordBatch.mock.calls[0][0][0].navigationId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("does not retry a failed view during the same navigation", async () => {
    mocks.recordBatch.mockResolvedValueOnce({ recorded: false });
    const view = render(
      <BehaviorViewEvent
        dedupeKey="dashboard"
        eventName="partner_dashboard_viewed"
        route="/cabinet"
      />,
    );
    await waitFor(() => expect(mocks.recordBatch).toHaveBeenCalledTimes(1));
    view.rerender(
      <BehaviorViewEvent
        dedupeKey="dashboard"
        eventName="partner_dashboard_viewed"
        route="/cabinet"
      />,
    );
    await Promise.resolve();
    expect(mocks.recordBatch).toHaveBeenCalledTimes(1);
  });

  it("keeps catalog navigation usable when analytics rejects", async () => {
    mocks.record.mockRejectedValueOnce(new Error("analytics unavailable"));
    render(<BehaviorTrackedCatalogLink ariaLabel="Показать все: Популярные товары" href="/cabinet/catalog?label=TOP" sourceSurface="TOP">Показать все</BehaviorTrackedCatalogLink>);
    const link = screen.getByRole("link", { name: "Показать все: Популярные товары" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
    expect(link).toHaveAttribute("href", "/cabinet/catalog?label=TOP");
  });

  it("keeps cabinet actions non-blocking when analytics is unavailable", () => {
    mocks.record.mockRejectedValueOnce(new Error("analytics unavailable"));

    expect(() => recordBehaviorInteraction({
      eventName: "dashboard_action_clicked",
      metadataSafe: { action: "orders" },
      route: "/cabinet",
      sourceSurface: "dashboard_quick_actions",
    })).not.toThrow();
  });

  it("defers menu telemetry beyond the interaction-critical window", () => {
    vi.useFakeTimers();
    scheduleBehaviorInteraction({
      eventName: "notifications_opened",
      route: "/cabinet/notifications",
      sourceSurface: "notification_bell",
    });

    expect(mocks.record).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(mocks.record).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
});
