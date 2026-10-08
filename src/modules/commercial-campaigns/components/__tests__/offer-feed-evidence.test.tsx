import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfferFeedEvidence } from "../OfferFeedEvidence";
const mocks = vi.hoisted(() => ({
  view: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
  interaction: vi.fn(),
}));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({
  BehaviorViewEvent: mocks.view,
  recordBehaviorInteraction: mocks.interaction,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("bounded marketplace evidence", () => {
  it("keeps filter, sort and pagination evidence without event-name deduplication loss", () => {
    render(
      <OfferFeedEvidence
        scope="filtered-page-2"
        count={20}
        page={2}
        filterUsed
        sortUsed
      >
        <span>Feed</span>
      </OfferFeedEvidence>,
    );
    const props = mocks.view.mock.calls[0][0] as unknown as {
      additionalEvents: Array<{ metadataSafe: { action: string } }>;
    };
    expect(props.additionalEvents).toHaveLength(1);
    expect(props.additionalEvents[0]).toMatchObject({
      metadataSafe: {
        action: "controls_used",
        filterUsed: true,
        sortUsed: true,
      },
    });
    expect(props).toMatchObject({
      metadataSafe: {
        action: "feed_impression",
        page: 2,
        paginationUsed: true,
      },
    });
    expect(mocks.interaction).not.toHaveBeenCalled();
  });
  it("measures one actual offer opening without blocking navigation", () => {
    render(
      <OfferFeedEvidence
        scope="all"
        count={1}
        page={1}
        filterUsed={false}
        sortUsed={false}
      >
        <article data-offer-id="campaign:1:item" data-offer-kind="PRODUCT">
          <a href="#detail">Open offer</a>
        </article>
      </OfferFeedEvidence>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open offer" }));
    expect(mocks.interaction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        metadataSafe: {
          action: "offer_opened",
          offerId: "campaign:1:item",
          kind: "PRODUCT",
        },
      }),
    );
    mocks.interaction.mockImplementationOnce(() => {
      throw Error("unavailable analytics");
    });
    expect(() =>
      fireEvent.click(screen.getByRole("link", { name: "Open offer" })),
    ).not.toThrow();
  });
});
