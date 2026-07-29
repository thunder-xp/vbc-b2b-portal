import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock("../../actions", () => ({
  recordBehaviorEventAction: mocks.record,
}));

import {
  BehaviorTrackedCatalogLink,
  BehaviorViewEvent,
  recordBehaviorInteraction,
} from "../BehaviorViewEvent";

describe("BehaviorViewEvent", () => {
  beforeEach(() => {
    mocks.record.mockClear();
    sessionStorage.clear();
  });

  it("deduplicates hydration and rerenders within one session", async () => {
    const view = render(
      <BehaviorViewEvent
        dedupeKey="catalog:all"
        eventName="catalog_viewed"
        route="/cabinet/catalog"
      />,
    );
    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
    view.rerender(
      <BehaviorViewEvent
        dedupeKey="catalog:all"
        eventName="catalog_viewed"
        route="/cabinet/catalog"
      />,
    );
    await Promise.resolve();
    expect(mocks.record).toHaveBeenCalledTimes(1);
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
});
