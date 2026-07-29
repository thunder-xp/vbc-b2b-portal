import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { canonicalStatuses, StatusBadge } from "../index";
import { businessTerms } from "../terminology";

describe("platform terminology and status", () => {
  it("keeps canonical partner-facing terminology free of technical labels", () => {
    expect(businessTerms.partnerPrice).toBe("Ваша цена");
    expect(businessTerms.plannedShipment).toBe("Планируемая отгрузка");
    expect(Object.values(businessTerms).join(" ")).not.toMatch(/\b(?:RPC|UUID|membership|provider)\b/i);
  });

  it.each([
    ["approved", "Одобрено"],
    ["underReview", "На рассмотрении"],
    ["failed", "Ошибка"],
    ["running", "Выполняется"],
  ] as const)("renders %s with text and an accessible status name", (key, label) => {
    render(<StatusBadge status={canonicalStatuses[key]} />);
    expect(screen.getByLabelText(`Статус: ${label}`)).toHaveTextContent(label);
  });
});
