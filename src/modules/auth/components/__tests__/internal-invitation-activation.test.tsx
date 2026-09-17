import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InternalInvitationActivationForm } from "../InternalInvitationActivationForm";

const replace = vi.fn();
const refresh = vi.fn();
const setSession = vi.fn();
const updateUser = vi.fn();
const readiness = vi.fn();
const activate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/src/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { setSession, updateUser },
  }),
}));

vi.mock("../../actions/internal-invitation.actions", () => ({
  activateInternalInvitationAction: (...args: unknown[]) => activate(...args),
  getInternalInvitationReadinessAction: (...args: unknown[]) => readiness(...args),
}));

describe("InternalInvitationActivationForm", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    setSession.mockReset().mockResolvedValue({ error: null });
    updateUser.mockReset().mockResolvedValue({ error: null });
    readiness.mockReset().mockResolvedValue({ state: "READY" });
    activate.mockReset().mockResolvedValue({ success: true, error: null });
    window.history.replaceState(null, "", "/auth/internal-invitation");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("terminates invalid and expired invitations without an infinite spinner", () => {
    const invalid = render(<InternalInvitationActivationForm initialState="INVALID_INVITE" />);
    expect(screen.getByText(/Ссылка приглашения недействительна/)).toBeInTheDocument();
    expect(screen.queryByText(/Проверяем защищённую ссылку/)).not.toBeInTheDocument();

    invalid.unmount();
    render(<InternalInvitationActivationForm initialState="EXPIRED_INVITE" />);
    expect(screen.getByText(/недействительна или истекла/)).toBeInTheDocument();
    expect(screen.queryByText(/Проверяем защищённую ссылку/)).not.toBeInTheDocument();
  });

  it("consumes an implicit invite session, removes tokens from the URL, and reaches READY", async () => {
    window.location.hash = "access_token=test-access&refresh_token=test-refresh&type=invite";
    render(<InternalInvitationActivationForm initialState="VERIFYING" />);

    const password = screen.getByLabelText("Новый пароль");
    await waitFor(() => expect(password).toBeEnabled());
    expect(setSession).toHaveBeenCalledWith({
      access_token: "test-access",
      refresh_token: "test-refresh",
    });
    expect(readiness).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
    expect(document.body.textContent).not.toContain("test-access");
    expect(password).toHaveAttribute("autocomplete", "new-password");
  });

  it("classifies an expired provider fragment and does not call session establishment", async () => {
    window.location.hash = "error=access_denied&error_code=otp_expired&error_description=expired";
    render(<InternalInvitationActivationForm initialState="VERIFYING" />);

    expect(await screen.findByText(/недействительна или истекла/)).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
    expect(readiness).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("sets the password through Supabase before governed activation", async () => {
    render(<InternalInvitationActivationForm initialState="READY" />);
    fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "StrongPass1" } });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "StrongPass1" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить пароль и активировать доступ" }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "StrongPass1" }));
    expect(activate).toHaveBeenCalledOnce();
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(activate.mock.invocationCallOrder[0]);
    expect(replace).toHaveBeenCalledWith("/admin");
  });
});
