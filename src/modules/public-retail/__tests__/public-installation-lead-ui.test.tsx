import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions/installation-lead.actions", () => ({
  submitPublicInstallationLeadAction: vi.fn(),
}));

import { PublicInstallationLeadForm } from "../components/PublicInstallationLeadForm";

describe("public installation lead form", () => {
  it("renders the low-friction Russian fields and safe prefill", () => {
    render(<PublicInstallationLeadForm locale="ru" objectType="warehouse" sourcePath="/calculator/cctv/result" submissionKey="20000000-0000-4000-8000-000000000002" systemType="cctv" />);
    expect(screen.getByRole("textbox", { name: "Имя" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Телефон" })).toBeRequired();
    const locality = screen.getByRole("combobox", { name: "Город / населённый пункт" });
    const objectType = screen.getByRole("combobox", { name: "Тип объекта" });
    const systemType = screen.getByRole("combobox", { name: "Система" });
    expect(locality).toHaveAttribute("list");
    expect(locality).toHaveClass("h-11", "border-zinc-300", "pr-10", "focus:border-blue-700");
    expect(locality.parentElement).toHaveClass("relative");
    expect(locality.parentElement?.querySelector("svg")).toHaveClass("pointer-events-none", "right-3");
    expect(objectType).toHaveValue("warehouse");
    expect(objectType).toHaveClass("h-11", "border-zinc-300", "focus:border-blue-700");
    expect(systemType).toHaveValue("cctv");
    expect(systemType).toHaveClass("h-11", "border-zinc-300", "focus:border-blue-700");
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить консультацию" })).toBeInTheDocument();
  });

  it("renders authored Romanian labels", () => {
    render(<PublicInstallationLeadForm locale="ro" objectType="office" sourcePath="/installation" submissionKey="20000000-0000-4000-8000-000000000003" systemType="access_control" />);
    expect(screen.getByRole("textbox", { name: "Nume" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Oraș / localitate" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Sistem" })).toHaveValue("access_control");
    expect(screen.getByRole("button", { name: "Solicită consultanță" })).toBeInTheDocument();
  });
});
