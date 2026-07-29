import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "../ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it("closes with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const { rerender } = render(<button>Открыть</button>);
    const trigger = screen.getByRole("button", { name: "Открыть" });
    trigger.focus();
    rerender(<><button>Открыть</button><ConfirmationDialog confirmLabel="Подтвердить" consequence="Будет изменена запись." onCancel={cancel} onConfirm={vi.fn()} open title="Подтверждение" /></>);
    expect(screen.getByRole("dialog", { name: "Подтверждение" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<button>Открыть</button>);
    expect(screen.getByRole("button", { name: "Открыть" })).toHaveFocus();
  });

  it("keeps destructive confirmation visually separate from primary actions", () => {
    render(<ConfirmationDialog confirmLabel="Удалить" consequence="Запись будет удалена." destructive onCancel={vi.fn()} onConfirm={vi.fn()} open title="Удаление" />);
    expect(screen.getByRole("button", { name: "Удалить" })).toHaveClass("text-red-700");
  });
});
