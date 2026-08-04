import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/cabinet/support/new" }));
import { PartnerSidebar } from "../PartnerSidebar";
import { resolveWorkspaceCapabilities } from "../../services/workspace-capability.service";

describe("support navigation", () => {
  it("groups exact children in canonical order and opens on active route", async () => { const capabilities = resolveWorkspaceCapabilities(new Set(["service.view", "support.view", "catalog.view"])); render(<PartnerSidebar navigation={capabilities.navigation} />); const trigger = screen.getByRole("button", { name: /Гарантия и техподдержка/ }); expect(trigger).toHaveAttribute("aria-expanded", "true"); const links = screen.getAllByRole("link").map((link) => link.textContent); expect(links.indexOf("Сервисный центр")).toBeLessThan(links.indexOf("IT-поддержка")); expect(screen.getByRole("link", { name: "IT-поддержка" })).toHaveAttribute("href", "/cabinet/support"); expect(screen.getAllByText("Сервисный центр")).toHaveLength(1); });
  it("keeps the parent when one child is permitted and toggles by keyboard click", async () => { const user = userEvent.setup(); const capabilities = resolveWorkspaceCapabilities(new Set(["support.view"])); render(<PartnerSidebar navigation={capabilities.navigation} />); const trigger = screen.getByRole("button", { name: /Гарантия и техподдержка/ }); await user.click(trigger); expect(trigger).toHaveAttribute("aria-expanded", "true"); expect(screen.queryByText("Сервисный центр")).not.toBeInTheDocument(); });
});
