import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InternalOrderDateChangesPage from "../page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/src/modules/orders/actions", () => ({ listInternalOrderDateChangesAction: mocks.list }));
vi.mock("@/src/modules/orders/components", () => ({ InternalOrderDateChangeReview: () => <button type="button">Одобрить</button> }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { mocks.redirect(path); throw new Error("redirect"); },
  notFound: () => { mocks.notFound(); throw new Error("not-found"); },
}));

describe("internal order date-change page gate", () => {
  it("redirects unauthenticated visitors", async () => {
    mocks.list.mockResolvedValue({ success: false, errorCode: "AUTH_REQUIRED", message: "", data: null });
    await expect(InternalOrderDateChangesPage()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("hides the queue from users without review permission", async () => {
    mocks.list.mockResolvedValue({ success: false, errorCode: "FORBIDDEN", message: "", data: null });
    await expect(InternalOrderDateChangesPage()).rejects.toThrow("not-found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("renders the queue for an authorized reviewer", async () => {
    mocks.list.mockResolvedValue({ success: true, errorCode: null, message: "", data: [] });
    render(await InternalOrderDateChangesPage());
    expect(screen.getByRole("heading", { name: "Переносы планируемой отгрузки" })).toBeInTheDocument();
  });
});
