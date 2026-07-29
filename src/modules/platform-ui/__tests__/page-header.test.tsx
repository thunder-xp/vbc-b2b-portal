import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
  it("renders one page heading with description and actions", () => {
    render(
      <PageHeader actions={<button type="button">Создать</button>} description="Описание раздела" eyebrow="Рабочая область" title="Спецификации" />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Описание раздела")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
  });
});
