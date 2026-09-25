"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";

import { createProfileAction } from "../../actions/create-profile.action";
import { updateOwnProfileAction } from "../../actions/update-profile.action";
import { saveBusinessProfileAction } from "@/src/modules/quick-auth/enrollment.actions";
import type { CurrentProfileDto } from "../../actions/current-profile.action";

type ProfileFormProps = {
  profile: CurrentProfileDto | null;
  phoneStatus?: ReactNode;
  businessPhoneVerification?: {
    locale: "ru" | "ro";
    returnTo: string;
  };
};

export function ProfileForm({ profile, phoneStatus, businessPhoneVerification }: ProfileFormProps) {
  const router = useRouter();
  const isNewProfile = !profile;
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const payload = { fullName, phone };
      const result = isNewProfile
        ? await createProfileAction(payload)
        : businessPhoneVerification
          ? await saveBusinessProfileAction({ fullName, targetPhone: phone })
          : await updateOwnProfileAction(payload);

      if (result.success) {
        if (isNewProfile) {
          router.replace("/onboarding/access-request");
          return;
        }

        if (businessPhoneVerification && "profile" in result) {
          if (!result.profile) {
            setError(profileSaveFailed(businessPhoneVerification.locale));
            return;
          }
          setFullName(result.profile.fullName ?? "");
          const verification = result.phoneVerification;
          if (verification?.ok && verification.step === "OTP") {
            const query = new URLSearchParams({
              lang: businessPhoneVerification.locale,
              next: businessPhoneVerification.returnTo,
              challenge: verification.challengeId,
            });
            router.replace(`/auth/business-phone-enrollment?${query.toString()}`);
            return;
          }
          if (verification?.ok && verification.step === "CONFIRMED") {
            setPhone(result.profile.phone ?? phone);
            setMessage(profileSaved(businessPhoneVerification.locale));
          } else if (verification && !verification.ok) {
            setMessage(profileSaved(businessPhoneVerification.locale));
            setError(phoneVerificationError(verification.error, businessPhoneVerification.locale));
          } else {
            setMessage(profileSaved(businessPhoneVerification.locale));
          }
        } else if ("data" in result) {
          setFullName(result.data.fullName ?? "");
          setPhone(result.data.phone ?? "");
          setMessage(result.message);
        }
        router.refresh();
        return;
      }

      setError(result.message);
    });
  }

  return (
    <form
      className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Profile
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {isNewProfile
            ? "Create your contact profile to start partner onboarding."
            : "Update your contact details for Novotech partner onboarding."}
        </p>
      </div>

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Full name
          <input
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="fullName"
            onChange={(event) => setFullName(event.target.value)}
            value={fullName}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Phone
          <input
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="phone"
            onChange={(event) => setPhone(event.target.value)}
            value={phone}
          />
        </label>
        {!isNewProfile ? phoneStatus : null}
      </div>

      {message && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={isPending}
        type="submit"
      >
        {isPending
          ? "Saving..."
          : isNewProfile
            ? "Create profile"
            : "Save profile"}
      </button>
    </form>
  );
}

function profileSaved(locale: "ru" | "ro") {
  return locale === "ro" ? "Profilul a fost salvat." : "Профиль сохранён.";
}

function profileSaveFailed(locale: "ru" | "ro") {
  return locale === "ro"
    ? "Profilul nu a putut fi salvat. Încercați din nou."
    : "Не удалось сохранить профиль. Попробуйте ещё раз.";
}

function phoneVerificationError(
  code: string,
  locale: "ru" | "ro",
) {
  if (code === "PHONE_CONFLICT") {
    return locale === "ro"
      ? "Acest număr este deja utilizat de alt cont."
      : "Этот номер уже используется другим аккаунтом.";
  }
  if (code === "INVALID_PHONE") {
    return locale === "ro"
      ? "Introduceți un număr de telefon valid din Moldova."
      : "Введите действительный номер телефона Молдовы.";
  }
  if (code === "PROVIDER_TEMPORARY") {
    return locale === "ro"
      ? "SMS-ul nu a putut fi trimis. Încercați mai târziu."
      : "Не удалось отправить SMS. Попробуйте позже.";
  }
  return locale === "ro"
    ? "Numărul nu a putut fi trimis spre verificare. Încercați din nou."
    : "Не удалось начать проверку номера. Попробуйте ещё раз.";
}
