import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock("../../actions", () => ({
  recordBehaviorEventAction: mocks.record,
}));

import { BehaviorViewEvent } from "../BehaviorViewEvent";

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
});
