"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitAccessRequestAction } from "../../actions/submit-access-request.action";

export function AccessRequestForm({
  initialName = "",
  initialPhone = "",
  legalForm = "LEGAL_ENTITY",
}: {
  initialName?: string;
  initialPhone?: string;
  legalForm?: "INDIVIDUAL" | "LEGAL_ENTITY";
}) {
  const router = useRouter();
  const [requestedCompanyName, setRequestedCompanyName] = useState(initialName);
  const [requestedFiscalCode, setRequestedFiscalCode] = useState("");
  const [contactPhone, setContactPhone] = useState(initialPhone);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const individual = legalForm === "INDIVIDUAL";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await submitAccessRequestAction({
        requestedCompanyName,
        requestedFiscalCode,
        contactPhone,
        message,
      });

      if (result.success) {
        router.replace("/onboarding/waiting");
        return;
      }

      if (result.errorCode === "DUPLICATE_REQUEST") {
        router.replace("/onboarding/waiting");
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
          Заявка на доступ
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {individual
            ? "Отправьте личные данные на рассмотрение менеджеру Novotech."
            : "Отправьте данные компании на рассмотрение менеджеру Novotech."}
        </p>
      </div>

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          {individual ? "Имя и фамилия" : "Название компании"}
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="requestedCompanyName"
            onChange={(event) => setRequestedCompanyName(event.target.value)}
            value={requestedCompanyName}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          {individual ? "IDNP" : "IDNO"}
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="requestedFiscalCode"
            onChange={(event) => setRequestedFiscalCode(event.target.value)}
            value={requestedFiscalCode}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Контактный телефон
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            name="contactPhone"
            onChange={(event) => setContactPhone(event.target.value)}
            value={contactPhone}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Комментарий
          <textarea
            className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-950"
            name="message"
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Отправка..." : "Отправить заявку"}
      </button>
    </form>
  );
}
