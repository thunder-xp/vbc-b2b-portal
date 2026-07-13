"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  Boxes,
  Camera,
  Check,
  ClipboardList,
  FileText,
  Globe2,
  Headphones,
  KeyRound,
  LogIn,
  Network,
  PackageSearch,
  PanelsTopLeft,
  Phone,
  RefreshCw,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { type PublicLocale, usePublicLocale } from "@/src/modules/public-locale";

import { landingCopy } from "./landing-copy";

const locales: PublicLocale[] = ["ru", "ro"];

const featureIcons = [
  PackageSearch,
  BadgeDollarSign,
  Warehouse,
  ClipboardList,
  Boxes,
  FileText,
];

const trustIcons = [ShieldCheck, BadgeDollarSign, RefreshCw, Headphones];
const capabilityIcons = [Camera, KeyRound, BellRing, Network, Phone, PanelsTopLeft];

export function LandingPage() {
  const { locale, setLocale } = usePublicLocale();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageTriggerRef = useRef<HTMLButtonElement>(null);
  const copy = landingCopy[locale];

  useEffect(() => {
    if (!languageOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageOpen(false);
        languageTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageOpen]);

  const selectLocale = (nextLocale: PublicLocale) => {
    setLocale(nextLocale);
    setLanguageOpen(false);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-white text-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex shrink-0 items-center gap-2.5" href="#platform" aria-label="Novotech Systems">
            <span className="flex size-9 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </span>
            <span className="text-sm font-bold text-zinc-950 sm:text-base">NOVOTECH SYSTEMS</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
            {copy.navigation.map((item) => (
              <a className="text-sm font-medium text-zinc-600 transition-colors hover:text-emerald-700" href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative" ref={languageMenuRef}>
              <button
                aria-expanded={languageOpen}
                aria-haspopup="menu"
                aria-label={copy.language.label}
                className="inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                onClick={() => setLanguageOpen((open) => !open)}
                ref={languageTriggerRef}
                type="button"
              >
                <Globe2 aria-hidden="true" className="size-4 text-emerald-700" />
                {locale.toUpperCase()}
              </button>
              {languageOpen ? (
                <div className="absolute right-0 top-12 w-44 rounded-md border border-zinc-200 bg-white p-1.5 shadow-lg" role="menu">
                  {locales.map((option) => (
                    <button
                      aria-checked={locale === option}
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"
                      key={option}
                      onClick={() => selectLocale(option)}
                      role="menuitemradio"
                      type="button"
                    >
                      <span><strong>{option.toUpperCase()}</strong> — {copy.language.options[option]}</span>
                      {locale === option ? <Check aria-hidden="true" className="size-4 text-emerald-700" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 sm:px-4"
              href="/auth/sign-in"
            >
              <LogIn aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{copy.signIn}</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative" id="platform">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-40 lg:block">
          <div className="absolute left-12 top-20 h-px w-48 bg-emerald-200" />
          <div className="absolute left-60 top-20 h-28 w-px bg-emerald-200" />
          <div className="absolute bottom-24 right-10 h-px w-56 bg-zinc-200" />
          <div className="absolute bottom-24 right-64 h-24 w-px bg-zinc-200" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100svh-11rem)] max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase text-emerald-700">{copy.hero.eyebrow}</p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl lg:text-6xl">
              {copy.hero.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">{copy.hero.description}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-emerald-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-800" href="/auth/sign-in">
                {copy.signIn}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link className="inline-flex h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-900 transition-colors hover:border-emerald-700 hover:text-emerald-800" href="/auth/register">
                {copy.hero.becomePartner}
              </Link>
            </div>

            <div className="mt-9 grid gap-x-6 gap-y-3 sm:grid-cols-2" id="support">
              {copy.hero.trustItems.map((label, index) => {
                const Icon = trustIcons[index];
                return (
                  <div className="flex items-center gap-2.5 text-sm text-zinc-600" key={label}>
                    <Icon aria-hidden="true" className="size-4 text-emerald-700" strokeWidth={1.8} />
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative" id="workspace">
            <div aria-hidden="true" className="absolute -inset-4 rounded-lg border border-emerald-100 bg-emerald-50/40" />
            <div className="relative rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-200/70">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase text-emerald-700">NOVOTECH SYSTEMS</p>
                  <h2 className="mt-1 text-base font-semibold text-zinc-950 sm:text-lg">{copy.workspace.title}</h2>
                </div>
                <span className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <PanelsTopLeft aria-hidden="true" className="size-5" />
                </span>
              </div>

              <div className="grid md:grid-cols-[1.25fr_0.75fr]">
                <div className="divide-y divide-zinc-100 px-5 py-2 sm:px-6">
                  {copy.workspace.features.map((label, index) => {
                    const Icon = featureIcons[index];
                    return (
                      <div className="flex min-h-12 items-center gap-3 py-2" id={index === 5 ? "documents" : undefined} key={label}>
                        <Icon aria-hidden="true" className="size-4 text-emerald-700" strokeWidth={1.8} />
                        <span className="flex-1 text-sm font-medium text-zinc-700">{label}</span>
                        <ArrowRight aria-hidden="true" className="size-4 text-zinc-300" />
                      </div>
                    );
                  })}
                </div>

                <div className="grid content-center gap-4 border-t border-zinc-200 bg-zinc-50 p-5 md:border-l md:border-t-0">
                  <div className="rounded-md border border-zinc-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <Warehouse aria-hidden="true" className="size-4 text-emerald-700" />
                      {copy.workspace.stockTitle}
                    </div>
                    <div aria-hidden="true" className="mt-4 space-y-2.5">
                      {["w-full", "w-4/5", "w-3/5", "w-2/3"].map((width) => (
                        <div className="h-2 rounded-sm bg-zinc-100" key={width}>
                          <div className={`h-2 rounded-sm bg-emerald-600 ${width}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-zinc-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <ShieldCheck aria-hidden="true" className="size-4 text-emerald-700" />
                      {copy.workspace.fulfillmentTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-500">{copy.workspace.fulfillmentText}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Novotech capabilities" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:grid-cols-6 lg:px-8">
          {copy.capabilities.map((label, index) => {
            const Icon = capabilityIcons[index];
            return (
              <div className="flex min-h-16 items-center gap-3 border-zinc-200 px-3 py-2 lg:border-r lg:last:border-r-0" key={label}>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-emerald-700" strokeWidth={1.7} />
                <span className="text-sm font-medium leading-5 text-zinc-700">{label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
