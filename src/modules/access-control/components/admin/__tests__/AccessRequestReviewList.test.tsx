import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccessRequestReviewList } from "../AccessRequestReviewList";

describe("AccessRequestReviewList", () => {
  it("renders the empty state in Russian", () => {
    render(<AccessRequestReviewList requests={[]} />);

    expect(
      screen.getByRole("heading", { name: "Нет заявок на рассмотрении" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Новые заявки партнёров появятся здесь после отправки."),
    ).toBeInTheDocument();
  });
});
