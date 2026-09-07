import type { CommunicationChannel, CommunicationIntent, RenderedCommunication } from "./communication-intent";
import { CommunicationTemplateRegistry } from "./communication-template.registry";

export const FINANCE_PAYMENT_REMINDER_TEMPLATE_KEY = "finance.payment_reminder" as const;
export const FINANCE_PAYMENT_REMINDER_TEMPLATE_VERSION = "v1" as const;

export type FinancePaymentReminderTemplateItem = Readonly<{
  orderNumber: string;
  dueDate: string;
  remainingAmount: string;
  paidAmount: string;
  plannedAmount: string;
  currency: string;
  paymentStatus: "OPEN" | "PARTIAL" | "SETTLED";
  timing: "UPCOMING" | "DUE_TODAY" | "OVERDUE";
  daysFromDue: number;
}>;

export type FinancePaymentReminderTemplateVariables = Record<string, unknown> & Readonly<{
  items: readonly FinancePaymentReminderTemplateItem[];
  totalsByCurrency: Readonly<Record<string, string>>;
  applicationOrigin: string;
}>;

export function createFinanceReminderTemplateRegistry(): CommunicationTemplateRegistry {
  const registry = new CommunicationTemplateRegistry();
  for (const locale of ["ru", "ro"] as const) {
    for (const channel of ["email", "in_app", "sms"] as const) {
      registry.register({
        templateKey: FINANCE_PAYMENT_REMINDER_TEMPLATE_KEY,
        templateVersion: FINANCE_PAYMENT_REMINDER_TEMPLATE_VERSION,
        locale,
        channel,
        render: renderFinancePaymentReminder,
      });
    }
  }
  return registry;
}

export function renderFinancePaymentReminder(
  intent: CommunicationIntent,
  channel: CommunicationChannel,
): RenderedCommunication {
  const variables = intent.variables as FinancePaymentReminderTemplateVariables;
  if (!Array.isArray(variables.items) || !variables.items.length) {
    throw new Error("Finance reminder template requires at least one item.");
  }
  if (channel === "email") return renderEmail(intent.recipient.locale, variables);
  if (channel === "in_app") return renderInApp(intent.recipient.locale, variables);
  return renderSms(intent.recipient.locale, variables);
}

function renderEmail(locale: "ru" | "ro", variables: FinancePaymentReminderTemplateVariables): RenderedCommunication {
  const { items, totalsByCurrency: totals } = variables;
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Deschideți calendarul de plăți" : "Открыть платёжный календарь";
  const subject = subjectFor(locale, counts, "email");
  const sections = buildSections(locale, items);
  const paymentCount = locale === "ro" ? roCount(items.length, "plată", "plăți") : `${items.length} ${ruPlural(items.length, "платёж", "платежа", "платежей")}`;
  const orderCount = locale === "ro" ? roCount(items.length, "comandă", "comenzi") : `${items.length} ${ruPlural(items.length, "заказ", "заказа", "заказов")}`;
  const intro = locale === "ro"
    ? `Calendarul de plăți: ${paymentCount}, ${orderCount}. Verificați termenele și soldurile curente.`
    : `Платёжный календарь: ${paymentCount}, ${orderCount}. Проверьте актуальные сроки и остатки.`;
  const ctaUrl = new URL("/cabinet/finance", `${variables.applicationOrigin}/`).toString();
  const textBody = [
    locale === "ro" ? "Bună ziua." : "Здравствуйте.",
    intro,
    ...sections.flatMap((section) => [section.title, ...section.lines]),
    `${ctaLabel}: ${ctaUrl}`,
  ].join("\n\n");
  return {
    subject,
    textBody,
    providerPayload: {
      kind: "finance_reminder_email",
      counts,
      totalsByCurrency: totals,
      sections,
      ctaLabel,
      ctaTarget: "/cabinet/finance",
      ctaUrl,
    },
  };
}

function renderInApp(locale: "ru" | "ro", variables: FinancePaymentReminderTemplateVariables): RenderedCommunication {
  const { items, totalsByCurrency: totals } = variables;
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Deschide finanțele" : "Открыть финансы";
  const fragments = locale === "ro"
    ? [counts.overdue ? `restante: ${counts.overdue}` : "", counts.dueToday ? `scadente astăzi: ${counts.dueToday}` : "", counts.upcoming ? `viitoare: ${counts.upcoming}` : ""]
    : [counts.overdue ? `просрочено: ${counts.overdue}` : "", counts.dueToday ? `сегодня: ${counts.dueToday}` : "", counts.upcoming ? `ближайшие: ${counts.upcoming}` : ""];
  const textBody = `${fragments.filter(Boolean).join(", ")}. ${locale === "ro" ? "Sold rămas" : "Остаток"}: ${formatTotals(totals, locale)}.`;
  const subject = subjectFor(locale, counts, "in_app");
  return {
    subject,
    textBody,
    providerPayload: {
      kind: "finance_reminder_in_app",
      title: subject,
      body: textBody,
      ctaLabel,
      ctaTarget: "/cabinet/finance",
      counts,
      totalsByCurrency: totals,
    },
  };
}

function renderSms(locale: "ru" | "ro", variables: FinancePaymentReminderTemplateVariables): RenderedCommunication {
  const { items, totalsByCurrency: totals } = variables;
  const counts = timingCounts(items);
  const ctaLabel = locale === "ro" ? "Detalii" : "Подробнее";
  const ctaUrl = new URL("/cabinet/finance", `${variables.applicationOrigin}/`).toString();
  const states = locale === "ro"
    ? [`restante ${counts.overdue}`, `astăzi ${counts.dueToday}`, `viitoare ${counts.upcoming}`]
    : [`просрочено ${counts.overdue}`, `сегодня ${counts.dueToday}`, `ближайшие ${counts.upcoming}`];
  const textBody = `Novotech: ${states.join(", ")}. ${locale === "ro" ? "Sold" : "Остаток"} ${formatTotals(totals, locale)}. ${ctaLabel}: ${ctaUrl}`;
  return {
    subject: locale === "ro" ? "Plăți Novotech" : "Платежи Novotech",
    textBody,
    providerPayload: {
      kind: "finance_reminder_sms_preview",
      body: textBody,
      ctaLabel,
      ctaTarget: "/cabinet/finance",
      ctaUrl,
      counts,
      totalsByCurrency: totals,
      smsEnabled: false,
    },
  };
}

function buildSections(locale: "ru" | "ro", items: readonly FinancePaymentReminderTemplateItem[]) {
  const definitions = [
    { timing: "OVERDUE", ru: "Просрочено", ro: "Plăți restante" },
    { timing: "DUE_TODAY", ru: "Сегодня к оплате", ro: "Scadente astăzi" },
    { timing: "UPCOMING", ru: "Ближайшие платежи", ro: "Plăți viitoare" },
  ] as const;
  return definitions.flatMap((definition) => {
    const sectionItems = items.filter((item) => item.timing === definition.timing);
    return sectionItems.length ? [{
      timing: definition.timing,
      title: locale === "ro" ? definition.ro : definition.ru,
      lines: sectionItems.map((item) => orderLine(locale, item)),
      orders: sectionItems.map((item) => ({
        orderNumber: item.orderNumber,
        dueDate: item.dueDate,
        remainingAmount: item.remainingAmount,
        paidAmount: item.paymentStatus === "PARTIAL" ? item.paidAmount : null,
        currency: item.currency,
        paymentStatus: item.paymentStatus,
        timing: item.timing,
        daysFromDue: item.daysFromDue,
      })),
    }] : [];
  });
}

function orderLine(locale: "ru" | "ro", item: FinancePaymentReminderTemplateItem): string {
  const remaining = `${formatAmount(item.remainingAmount, locale)} ${item.currency}`;
  const paid = `${formatAmount(item.paidAmount, locale)} ${item.currency}`;
  const date = formatDate(item.dueDate, locale);
  if (locale === "ro") {
    const timing = item.timing === "DUE_TODAY"
      ? "scadentă astăzi"
      : item.timing === "UPCOMING"
        ? `scadentă la ${date}, peste ${roCount(Math.abs(item.daysFromDue), "zi", "zile")}`
        : `scadentă la ${date}, întârziere de ${roCount(item.daysFromDue, "zi", "zile")}`;
    const amount = item.paymentStatus === "PARTIAL" ? `achitat ${paid}; sold rămas ${remaining}` : `sold rămas ${remaining}`;
    return `Comanda ${item.orderNumber} — ${timing}; ${amount}.`;
  }
  const timing = item.timing === "DUE_TODAY"
    ? "срок сегодня"
    : item.timing === "UPCOMING"
      ? `срок ${date}, через ${Math.abs(item.daysFromDue)} ${ruPlural(Math.abs(item.daysFromDue), "день", "дня", "дней")}`
      : `срок ${date}, просрочено на ${item.daysFromDue} ${ruPlural(item.daysFromDue, "день", "дня", "дней")}`;
  const amount = item.paymentStatus === "PARTIAL" ? `оплачено ${paid}; осталось ${remaining}` : `осталось ${remaining}`;
  return `Заказ ${item.orderNumber} — ${timing}; ${amount}.`;
}

function subjectFor(locale: "ru" | "ro", counts: ReturnType<typeof timingCounts>, channel: "email" | "in_app") {
  const populated = [counts.overdue, counts.dueToday, counts.upcoming].filter(Boolean).length;
  if (locale === "ro") {
    if (populated > 1) return channel === "email" ? "Plăți care necesită atenție — Novotech" : "Plăți care necesită atenție";
    if (counts.overdue) return channel === "email" ? "Plăți restante — Novotech" : "Aveți plăți restante";
    if (counts.dueToday) return channel === "email" ? "Plăți scadente astăzi — Novotech" : "Plăți scadente astăzi";
    return channel === "email" ? "Plăți viitoare — Novotech" : "Plăți viitoare";
  }
  if (populated > 1) return channel === "email" ? "Платежи требуют внимания — Novotech" : "Платежи требуют внимания";
  if (counts.overdue) return channel === "email" ? "Просроченные платежи — Novotech" : "Есть просроченные платежи";
  if (counts.dueToday) return channel === "email" ? "Платежи на сегодня — Novotech" : "Платежи на сегодня";
  return channel === "email" ? "Ближайшие платежи — Novotech" : "Ближайшие платежи";
}

function timingCounts(items: readonly FinancePaymentReminderTemplateItem[]) {
  return {
    overdue: items.filter((item) => item.timing === "OVERDUE").length,
    dueToday: items.filter((item) => item.timing === "DUE_TODAY").length,
    upcoming: items.filter((item) => item.timing === "UPCOMING").length,
  };
}

function formatTotals(totals: Readonly<Record<string, string>>, locale: "ru" | "ro"): string {
  return Object.entries(totals).map(([currency, value]) => `${formatAmount(value, locale)} ${currency}`).join(", ");
}

function roCount(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

export function ruPlural(value: number, one: string, few: string, many: string): string {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatAmount(value: string, locale: "ru" | "ro"): string {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value: string, locale: "ru" | "ro"): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
