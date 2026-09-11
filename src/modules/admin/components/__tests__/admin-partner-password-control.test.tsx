import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const changePassword = vi.hoisted(() => vi.fn());
vi.mock("../../actions", () => ({
  changeAdminPartnerPasswordAction: changePassword,
  INITIAL_ADMIN_PARTNER_PASSWORD_STATE: { status: "idle", message: "", correlationId: null },
}));

import { AdminPartnerPasswordControl } from "../AdminPartnerPasswordControl";

const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("AdminPartnerPasswordControl", () => {
  it("opens a compact RU password modal with protected, non-persistent credential fields", () => {
    render(<AdminPartnerPasswordControl locale="ru" targetProfileId={TARGET_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));

    expect(screen.getByRole("dialog", { name: "Сменить пароль" })).toBeInTheDocument();
    const fields = screen.getAllByLabelText(/пароль/i, { selector: "input" }) as HTMLInputElement[];
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.type).toBe("password");
      expect(field.autocomplete).toBe("new-password");
      expect(field.minLength).toBe(8);
    }
    expect(screen.queryByText(/текущий пароль/i)).not.toBeInTheDocument();
  });

  it("validates policy and confirmation in the client before server submission", () => {
    render(<AdminPartnerPasswordControl locale="ru" targetProfileId={TARGET_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
    fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить новый пароль" }));
    expect(screen.getByRole("alert")).toHaveTextContent("не менее 8 символов");

    fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "Long-enough-1" } });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "Long-enough-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить новый пароль" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("supports show/hide without changing the credential value", () => {
    render(<AdminPartnerPasswordControl locale="ru" targetProfileId={TARGET_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
    const field = screen.getByLabelText("Новый пароль") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "Long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(field.type).toBe("text");
    expect(field.value).toBe("Long-enough-1");
    fireEvent.click(screen.getByRole("button", { name: "Скрыть пароль" }));
    expect(field.type).toBe("password");
  });

  it("renders the complete Romanian flow", () => {
    render(<AdminPartnerPasswordControl locale="ro" targetProfileId={TARGET_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Schimbă parola" }));
    expect(screen.getByRole("dialog", { name: "Schimbă parola" })).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă nouă")).toBeInTheDocument();
    expect(screen.getByLabelText("Repetați parola")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează parola nouă" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anulează" })).toBeInTheDocument();
  });
});
