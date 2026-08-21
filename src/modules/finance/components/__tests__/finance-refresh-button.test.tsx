import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FinanceRefreshButton } from "../FinanceRefreshButton";
import { getFinanceCopy } from "../../../partner-locale";

const refresh = vi.fn();
const synchronize = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions", () => ({
  synchronizeOwnFinanceCompanyAction: (...args: unknown[]) => synchronize(...args),
}));

describe("FinanceRefreshButton", () => {
  beforeEach(() => {
    refresh.mockReset();
    synchronize.mockReset();
  });

  it("runs the governed own-company synchronization and refreshes after success", async () => {
    synchronize.mockResolvedValue({ success: true, data: { status: "published" }, message: "Финансовые данные обновлены из 1С." });
    const user = userEvent.setup();
    render(<FinanceRefreshButton />);

    await user.click(screen.getByRole("button", { name: "Обновить из 1С" }));

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(getFinanceCopy("ru").syncSuccess)).toBeInTheDocument();
  });

  it("preserves the rendered snapshot when synchronization fails", async () => {
    synchronize.mockResolvedValue({ success: false, message: "Не удалось обновить финансовые данные." });
    const user = userEvent.setup();
    render(<FinanceRefreshButton />);

    await user.click(screen.getByRole("button", { name: "Обновить из 1С" }));

    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByText(getFinanceCopy("ru").syncFailed)).toBeInTheDocument();
  });
});
