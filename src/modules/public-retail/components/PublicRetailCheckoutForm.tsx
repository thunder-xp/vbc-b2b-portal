"use client";

import { AlertCircle, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createPublicRetailOrderAction } from "../actions/retail-checkout.actions";
import { formatRetailPrice } from "../presentation";
import type { PublicRetailCheckoutDto, PublicRetailLocale } from "../types";

const inputClass = "mt-1 min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

export function PublicRetailCheckoutForm({ checkout, locale }: { checkout: PublicRetailCheckoutDto; locale: PublicRetailLocale }) {
  const ru = locale === "ru";
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [installationSame, setInstallationSame] = useState(true);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const installationRequested = checkout.bundles.some((bundle) => bundle.installationIntent && Object.values(bundle.installationIntent).some(Boolean));

  function submit(formData: FormData) {
    if (pending) return;
    setMessage("");
    startTransition(async () => {
      const address = (prefix: string) => ({
        locality: String(formData.get(`${prefix}Locality`) ?? ""), street: String(formData.get(`${prefix}Street`) ?? ""),
        building: String(formData.get(`${prefix}Building`) ?? ""), unit: String(formData.get(`${prefix}Unit`) ?? "") || null,
        postalCode: String(formData.get(`${prefix}PostalCode`) ?? "") || null, instructions: String(formData.get(`${prefix}Instructions`) ?? "") || null,
      });
      const result = await createPublicRetailOrderAction({
        locale, checkoutFingerprint: checkout.fingerprint, submissionKey,
        name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? ""), email: String(formData.get("email") ?? "") || null,
        deliveryAddress: address("delivery"), installationSameAsDelivery: !installationRequested || installationSame,
        installationAddress: installationRequested && !installationSame ? address("installation") : null,
        processingAcknowledged: formData.get("processingAcknowledged") === "on",
      });
      if (result.success && result.orderToken) { router.push(`/order/${result.orderToken}?lang=${locale}`); return; }
      setMessage(result.message);
      requestAnimationFrame(() => errorRef.current?.focus());
      if (result.conflict) router.refresh();
    });
  }

  return <form action={submit} className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
    <div className="space-y-6">
      {message ? <div aria-live="assertive" className="flex gap-3 border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-900" ref={errorRef} tabIndex={-1}><AlertCircle aria-hidden="true" className="size-5 shrink-0" />{message}</div> : null}
      {checkout.priceChanged ? <div className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">{ru ? "Цена одной или нескольких позиций изменилась. Ниже показаны актуальные цены; подтвердите именно их." : "Prețul uneia sau mai multor poziții s-a modificat. Mai jos sunt prețurile actuale; confirmați-le pe acestea."}</div> : null}
      <fieldset className="border border-zinc-200 bg-white p-5"><legend className="px-1 text-lg font-semibold">{ru ? "Контактные данные" : "Date de contact"}</legend><div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label={ru ? "Имя и фамилия" : "Nume și prenume"}><input autoComplete="name" className={inputClass} maxLength={160} name="name" required /></Field>
        <Field label={ru ? "Телефон" : "Telefon"}><input autoComplete="tel" className={inputClass} inputMode="tel" name="phone" placeholder="+373 60 000 000" required /></Field>
        <Field label={ru ? "Email (необязательно)" : "Email (opțional)"}><input autoComplete="email" className={inputClass} inputMode="email" maxLength={254} name="email" type="email" /></Field>
      </div></fieldset>
      <AddressFields locale={locale} prefix="delivery" title={ru ? "Адрес доставки" : "Adresa de livrare"} />
      {installationRequested ? <section className="border border-zinc-200 bg-white p-5"><div className="flex items-center gap-3"><MapPin aria-hidden="true" className="size-5 text-emerald-700" /><h2 className="text-lg font-semibold">{ru ? "Адрес монтажа" : "Adresa instalării"}</h2></div><label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input checked={installationSame} className="size-5 accent-emerald-700" onChange={(event) => setInstallationSame(event.target.checked)} type="checkbox" />{ru ? "Адрес монтажа совпадает с адресом доставки" : "Adresa instalării coincide cu adresa de livrare"}</label>{!installationSame ? <div className="mt-5"><AddressFields embedded locale={locale} prefix="installation" /></div> : null}</section> : null}
      <label className="flex items-start gap-3 border border-zinc-200 bg-white p-4 text-sm leading-6"><input className="mt-0.5 size-5 shrink-0 accent-emerald-700" name="processingAcknowledged" required type="checkbox" /><span>{ru ? "Подтверждаю передачу контактных данных для подготовки и выполнения заказа." : "Confirm transmiterea datelor de contact pentru pregătirea și executarea comenzii."}</span></label>
    </div>
    <aside className="border border-zinc-200 bg-white p-5 lg:sticky lg:top-24"><h2 className="text-lg font-semibold">{ru ? "Проверка заказа" : "Verificarea comenzii"}</h2><ul className="mt-4 divide-y divide-zinc-100">{checkout.lines.map((line) => <li className="py-3 text-sm" key={`${line.bundleId ?? "single"}:${line.publicProductId}`}><div className="flex justify-between gap-4"><span><strong className="block">{line.name}</strong><span className="text-zinc-500">{line.quantity} {unitLabel(line.unitCode, locale)} × {formatRetailPrice(line.unitPrice, line.currency, locale)}</span></span><strong className="shrink-0 tabular-nums">{formatRetailPrice(line.lineTotal, line.currency, locale)}</strong></div></li>)}</ul><dl className="mt-4 space-y-2 border-t border-zinc-200 pt-4 text-sm"><Summary label={ru ? "Оборудование" : "Echipamente"} value={checkout.totals.equipment} currency={checkout.totals.currency} locale={locale} /><Summary label={ru ? "Материалы" : "Materiale"} value={checkout.totals.materials} currency={checkout.totals.currency} locale={locale} /></dl><div className="mt-4 border-t border-zinc-200 pt-4"><div className="flex items-end justify-between gap-3"><span className="font-semibold">{ru ? "Стоимость оборудования и материалов" : "Costul echipamentelor și materialelor"}</span><strong className="text-xl tabular-nums">{formatRetailPrice(checkout.totals.total, checkout.totals.currency, locale)}</strong></div></div>{installationRequested ? <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm leading-5 text-amber-950">{ru ? "Стоимость монтажных работ будет подтверждена отдельно." : "Costul lucrărilor de instalare va fi confirmat separat."}</p> : null}<button className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-5" />}{pending ? (ru ? "Подготавливаем заказ…" : "Pregătim comanda…") : (ru ? "Подтвердить заказ" : "Confirmă comanda")}</button><p className="mt-3 text-xs leading-5 text-zinc-500">{ru ? "Заказ будет создан в статусе «Ожидает оплаты». Онлайн-оплата появится на следующем этапе." : "Comanda va fi creată cu statutul «Așteaptă plata». Plata online va fi disponibilă la etapa următoare."}</p></aside>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-medium text-zinc-700">{label}{children}</label>; }
function AddressFields({ locale, prefix, title, embedded = false }: { locale: PublicRetailLocale; prefix: string; title?: string; embedded?: boolean }) { const ru = locale === "ru"; const fields = <div className="grid gap-4 sm:grid-cols-2"><Field label={ru ? "Город / населённый пункт" : "Oraș / localitate"}><input autoComplete={prefix === "delivery" ? "address-level2" : "off"} className={inputClass} maxLength={120} name={`${prefix}Locality`} required /></Field><Field label={ru ? "Улица" : "Strada"}><input autoComplete={prefix === "delivery" ? "address-line1" : "off"} className={inputClass} maxLength={160} name={`${prefix}Street`} required /></Field><Field label={ru ? "Дом / корпус" : "Casa / blocul"}><input className={inputClass} maxLength={40} name={`${prefix}Building`} required /></Field><Field label={ru ? "Квартира / офис (необязательно)" : "Apartament / oficiu (opțional)"}><input className={inputClass} maxLength={80} name={`${prefix}Unit`} /></Field><Field label={ru ? "Почтовый индекс (необязательно)" : "Cod poștal (opțional)"}><input autoComplete={prefix === "delivery" ? "postal-code" : "off"} className={inputClass} maxLength={20} name={`${prefix}PostalCode`} /></Field><Field label={ru ? "Уточнения (необязательно)" : "Indicații (opțional)"}><input className={inputClass} maxLength={500} name={`${prefix}Instructions`} /></Field></div>; if (embedded) return fields; return <fieldset className="border border-zinc-200 bg-white p-5"><legend className="px-1 text-lg font-semibold">{title}</legend><div className="mt-3">{fields}</div></fieldset>; }
function Summary({ label, value, currency, locale }: { label: string; value: number; currency: string; locale: PublicRetailLocale }) { return <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold tabular-nums">{formatRetailPrice(value, currency, locale)}</dd></div>; }
function unitLabel(unit: "piece" | "meter" | "service", locale: PublicRetailLocale) { if (unit === "meter") return "m"; if (unit === "service") return locale === "ru" ? "усл." : "serv."; return locale === "ru" ? "шт." : "buc."; }
