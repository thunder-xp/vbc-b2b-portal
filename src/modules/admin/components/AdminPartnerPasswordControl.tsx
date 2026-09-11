"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { PASSWORD_MIN_LENGTH, passwordPolicyIssue } from "@/src/modules/auth/password-policy";
import { ConfirmationDialog, actionClassName } from "@/src/modules/platform-ui";

import {
  changeAdminPartnerPasswordAction,
  type AdminPartnerPasswordActionState,
} from "../actions";
import { adminPartnerPasswordCopy } from "../password-change-copy";
import { PartnerLocaleProvider, type PartnerLocale } from "../../partner-locale";

const INITIAL_ADMIN_PARTNER_PASSWORD_STATE: AdminPartnerPasswordActionState = {
  status: "idle",
  message: "",
  correlationId: null,
};

export function AdminPartnerPasswordControl({
  locale,
  targetProfileId,
}: {
  locale: PartnerLocale;
  targetProfileId: string;
}) {
  const copy = adminPartnerPasswordCopy(locale);
  const [open, setOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <PartnerLocaleProvider locale={locale}>
    <div>
      <button
        className={actionClassName.secondary}
        onClick={() => {
          setSuccessMessage(null);
          setOpen(true);
        }}
        type="button"
      >
        <KeyRound aria-hidden="true" className="size-4" />
        {copy.action}
      </button>
      {successMessage ? (
        <p aria-live="polite" className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {successMessage}
        </p>
      ) : null}
      {open ? (
        <PasswordDialog
          locale={locale}
          onCancel={() => setOpen(false)}
          onSuccess={(message) => {
            setOpen(false);
            setSuccessMessage(message);
          }}
          targetProfileId={targetProfileId}
        />
      ) : null}
    </div>
    </PartnerLocaleProvider>
  );
}

function PasswordDialog({ locale, onCancel, onSuccess, targetProfileId }: {
  locale: PartnerLocale;
  onCancel: () => void;
  onSuccess: (message: string) => void;
  targetProfileId: string;
}) {
  const copy = adminPartnerPasswordCopy(locale);
  const [state, action, pending] = useActionState(
    changeAdminPartnerPasswordAction,
    INITIAL_ADMIN_PARTNER_PASSWORD_STATE,
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);

  function submit(): void {
    const issue = passwordPolicyIssue(password);
    if (issue === "required") {
      setClientError(copy.errors.PASSWORD_REQUIRED);
      return;
    }
    if (issue) {
      setClientError(copy.errors.PASSWORD_POLICY);
      return;
    }
    if (password !== confirmation) {
      setClientError(copy.errors.PASSWORD_MISMATCH);
      return;
    }
    setClientError(null);
    formRef.current?.requestSubmit();
  }

  return (
    <ConfirmationDialog
      confirmLabel={pending ? copy.saving : copy.save}
      consequence={copy.consequence}
      onCancel={onCancel}
      onConfirm={submit}
      open
      pending={pending}
      title={copy.dialogTitle}
    >
      <form action={action} className="grid gap-4" noValidate ref={formRef}>
        <input name="targetProfileId" type="hidden" value={targetProfileId} />
        <PasswordField
          autoFocus
          label={copy.newPassword}
          name="newPassword"
          onChange={setPassword}
          show={showPassword}
          value={password}
        />
        <PasswordField
          label={copy.confirmPassword}
          name="confirmPassword"
          onChange={setConfirmation}
          show={showPassword}
          value={confirmation}
        />
        <button
          aria-pressed={showPassword}
          className={`${actionClassName.tertiary} justify-self-start`}
          onClick={() => setShowPassword((value) => !value)}
          type="button"
        >
          {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          {showPassword ? copy.hidePassword : copy.showPassword}
        </button>
        {clientError || state.status === "error" || state.status === "partial" ? (
          <p
            aria-live="assertive"
            className={`rounded-md px-3 py-2 text-sm ${state.status === "partial" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}
            role="alert"
          >
            {clientError ?? state.message}
          </p>
        ) : null}
      </form>
    </ConfirmationDialog>
  );
}

function PasswordField({ autoFocus = false, label, name, onChange, show, value }: {
  autoFocus?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  show: boolean;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-800">
      {label}
      <input
        autoComplete="new-password"
        autoFocus={autoFocus}
        className="h-11 rounded-md border border-zinc-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        minLength={PASSWORD_MIN_LENGTH}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        type={show ? "text" : "password"}
        value={value}
      />
    </label>
  );
}
