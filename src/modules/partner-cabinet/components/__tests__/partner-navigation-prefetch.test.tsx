import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      prefetch?: boolean;
    }) => React.createElement("a", { ...props, "data-prefetch": String(prefetch) }, children),
    useLinkStatus: () => ({ pending: false }),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/cabinet" }));

import { resolveWorkspaceCapabilities } from "../../services";
import { PartnerSidebar } from "../PartnerSidebar";

const navigation = resolveWorkspaceCapabilities(new Set(["catalog.view"])).navigation;

describe("partner navigation intent prefetch", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for sustained pointer intent and cancels flyover prefetch", () => {
    vi.useFakeTimers();
    render(<PartnerSidebar navigation={navigation} />);
    const link = screen.getByRole("link", { name: /Каталог товаров/ });

    fireEvent.mouseEnter(link);
    act(() => vi.advanceTimersByTime(99));
    expect(link).toHaveAttribute("data-prefetch", "false");
    fireEvent.mouseLeave(link);
    act(() => vi.runAllTimers());
    expect(link).toHaveAttribute("data-prefetch", "false");

    fireEvent.mouseEnter(link);
    act(() => vi.advanceTimersByTime(100));
    expect(link).toHaveAttribute("data-prefetch", "true");
  });

  it("prefetches immediately for keyboard intent", () => {
    render(<PartnerSidebar navigation={navigation} />);
    const link = screen.getByRole("link", { name: /Каталог товаров/ });

    fireEvent.focus(link);
    expect(link).toHaveAttribute("data-prefetch", "true");
  });
});
