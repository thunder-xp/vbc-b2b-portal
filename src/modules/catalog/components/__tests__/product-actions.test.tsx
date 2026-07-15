import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductComparisonAction } from "../ProductComparisonAction";
import { ProductSpecificationAction } from "../ProductSpecificationAction";

const listSpecifications = vi.fn();
const addItem = vi.fn();
vi.mock("../../../project-specifications/actions", () => ({ listProjectSpecificationsAction: (...args: unknown[]) => listSpecifications(...args), addProjectSpecificationItemAction: (...args: unknown[]) => addItem(...args) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("product secondary actions", () => {
  it("prevents duplicate comparison products and caps a category at four", () => {
    const { rerender } = render(<ProductComparisonAction categoryId="category-1" companyId="company-1" productId="product-1" userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    fireEvent.click(screen.getByRole("button", { name: "В сравнении" }));
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    expect(JSON.parse(localStorage.getItem("novotech-catalog-compare:company-1:user-1:category-1") ?? "[]")).toEqual(["product-1"]);
    localStorage.setItem("novotech-catalog-compare:company-1:user-1:category-1", JSON.stringify(["a", "b", "c", "d"]));
    rerender(<ProductComparisonAction categoryId="category-1" companyId="company-1" productId="product-5" userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    expect(JSON.parse(localStorage.getItem("novotech-catalog-compare:company-1:user-1:category-1") ?? "[]")).toHaveLength(4);
  });

  it("adds a real product and quantity to a selected draft specification", async () => {
    listSpecifications.mockResolvedValue({ success: true, data: [{ id: "spec-1", projectName: "Site", status: "draft" }] });
    addItem.mockResolvedValue({ success: true, message: "ok", data: null });
    render(<ProductSpecificationAction productId="product-1" />);
    fireEvent.click(screen.getByRole("button", { name: "В смету" }));
    await screen.findByRole("option", { name: "Site" });
    fireEvent.change(screen.getByLabelText("Количество"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith("spec-1", "product-1", 3));
  });
});
