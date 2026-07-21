import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setFavoriteProductAction } from "../../actions";
import { FavoriteProductButton } from "../FavoriteProductButton";

vi.mock("../../actions", () => ({ setFavoriteProductAction: vi.fn() }));

const PRODUCT_ID = "55555555-5555-4555-8555-555555555555";

describe("FavoriteProductButton", () => {
  beforeEach(() => vi.mocked(setFavoriteProductAction).mockResolvedValue({ success: true, errorCode: null, message: "Saved", data: { saved: true, listId: "list-1" } }));

  it("optimistically adds a product and exposes pressed state", async () => {
    render(<FavoriteProductButton initialSaved={false} productId={PRODUCT_ID} />);
    const button = screen.getByRole("button", { name: "Добавить в избранное" });
    await userEvent.click(button);
    expect(setFavoriteProductAction).toHaveBeenCalledWith(PRODUCT_ID, true);
    expect(await screen.findByRole("button", { name: "Удалить из избранного" })).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls back optimistic state when persistence fails", async () => {
    vi.mocked(setFavoriteProductAction).mockResolvedValue({ success: false, message: "Failed", errorCode: "UNKNOWN_ERROR", data: null });
    render(<FavoriteProductButton initialSaved={false} productId={PRODUCT_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Добавить в избранное" }));
    expect(await screen.findByRole("button", { name: "Добавить в избранное" })).toHaveAttribute("aria-pressed", "false");
  });
});
