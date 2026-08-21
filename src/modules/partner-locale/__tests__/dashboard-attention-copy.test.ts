import { describe, expect, it } from "vitest";

import {
  formatPartnerRelativeDate,
  platformDashboardAttentionKinds,
  presentDashboardAttention,
} from "..";

const NOW = Date.UTC(2026, 7, 21, 12);

const expected = {
  notification_cart_product_price_changed: ["Цена товара в корзине изменилась", "Prețul unui produs din coș s-a modificat", "Deschide coșul"],
  notification_cart_product_availability_changed: ["Наличие товара в корзине изменилось", "Disponibilitatea unui produs din coș s-a modificat", "Deschide coșul"],
  notification_warehouse_arrival_completed: ["Новое пополнение склада", "Ultima aprovizionare a depozitului", "Vezi ultima aprovizionare"],
  test_return_overdue: ["Тестовый период завершён", "Perioada de testare s-a încheiat", "Deschide comanda"],
  test_return_today: ["Тестовый период завершается сегодня", "Perioada de testare se încheie astăzi", "Deschide comanda"],
  portal_order_failure: ["Заказ NSUU-1 требует проверки", "Comanda NSUU-1 necesită verificare", "Deschide comanda"],
  shipment_overdue: ["Отгрузка заказа NSUU-1 просрочена", "Livrarea comenzii NSUU-1 este întârziată", "Deschide comanda"],
  shipment_today: ["Отгрузка заказа NSUU-1 запланирована сегодня", "Livrarea comenzii NSUU-1 este planificată astăzi", "Deschide comanda"],
  date_change_rejected: ["Перенос даты по заказу NSUU-1 отклонён", "Reprogramarea comenzii NSUU-1 a fost respinsă", "Deschide comanda"],
  date_change_pending: ["Запрос переноса по заказу NSUU-1 рассматривается", "Solicitarea de reprogramare a comenzii NSUU-1 este în curs de examinare", "Deschide comanda"],
} as const;

describe("dashboard attention localization", () => {
  it.each(platformDashboardAttentionKinds)("covers %s in RU and RO", (kind) => {
    const source = fixture(kind);
    const ru = presentDashboardAttention(source, "ru", NOW);
    const ro = presentDashboardAttention(source, "ro", NOW);

    expect(ru.title).toBe(expected[kind][0]);
    expect(ro.title).toBe(expected[kind][1]);
    expect(ro.ctaLabel).toBe(expected[kind][2]);
    expect(`${ro.title} ${ro.consequence} ${ro.ctaLabel}`).not.toMatch(/[\u0400-\u04ff]|�/u);
    expect(ro.href).toBe(source.href);
  });

  it("uses locale-aware relative days for overdue test equipment", () => {
    const item = presentDashboardAttention(fixture("test_return_overdue"), "ro", NOW);
    expect(item.consequence).toBe("Perioada de testare s-a încheiat acum 52 de zile. Vă rugăm să returnați echipamentul în stare comercială la depozitul Novotech.");
  });

  it("uses the approved Romanian relative-day glossary", () => {
    expect(formatPartnerRelativeDate("2026-08-21", "ro", NOW)).toBe("astăzi");
    expect(formatPartnerRelativeDate("2026-06-30", "ro", NOW)).toBe("acum 52 de zile");
  });

  it("keeps the approved warehouse body and UTF-8 Romanian diacritics intact", () => {
    const item = presentDashboardAttention(fixture("notification_warehouse_arrival_completed"), "ro", NOW);
    expect(item.consequence).toBe("Livrarea a fost finalizată. Produsele au ajuns în depozit și sunt disponibile pentru expediere.");
    expect(JSON.parse(JSON.stringify({ sample: "ăâîșț", item }))).toMatchObject({ sample: "ăâîșț" });
  });

  it("preserves governed source prose where reconstruction is not allowed", () => {
    const source = { ...fixture("date_change_rejected"), consequence: "Комментарий Novotech", consequenceSource: "source" as const };
    expect(presentDashboardAttention(source, "ro", NOW).consequence).toBe("Комментарий Novotech");
  });

  it("preserves unknown legacy attention without guessing a translation", () => {
    const source = fixture("legacy_source_event");
    expect(presentDashboardAttention(source, "ro", NOW)).toBe(source);
  });
});

function fixture(kind: string) {
  return {
    kind,
    title: "Сохранённый заголовок",
    consequence: "Сохранённое описание",
    ctaLabel: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ",
    orderNumber: "NSUU-1",
    plannedDate: "2026-06-30",
    consequenceSource: "platform" as const,
    href: "/cabinet/orders/order-1",
  };
}
