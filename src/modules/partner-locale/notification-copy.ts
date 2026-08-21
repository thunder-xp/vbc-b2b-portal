import type { PartnerNotificationEventCode } from "../notifications/domain/event-catalog";
import type { PartnerNotification } from "../notifications/types";
import { definePartnerCopy } from "./define-copy";
import { partnerLocaleTag, type PartnerLocale } from "./locale";

export const notificationCopy = definePartnerCopy(
  {
    title: "Уведомления",
    workspace: "Рабочий кабинет",
    intro: "Важные изменения по заказам, отгрузкам и доступу сотрудников.",
    settings: "Настройки",
    filters: "Фильтры уведомлений",
    filterAll: "Все",
    filterOrders: "Заказы",
    filterShipments: "Отгрузки",
    filterAccess: "Доступ сотрудников",
    filterProducts: "Товары",
    filterUnread: "Непрочитанные",
    loadError: "Не удалось загрузить уведомления. Обновите страницу.",
    emptyTitle: "Здесь всё спокойно",
    emptyMessage: "Новые события по заказам, отгрузкам и доступу сотрудников появятся здесь.",
    backWorkspace: "Вернуться в рабочий кабинет",
    unread: "Непрочитано",
    showMore: "Показать ещё",
    settingsTitle: "Настройки уведомлений",
    settingsIntro: "Настройки применяются только к вашему профилю в текущей компании.",
    settingsLoadError: "Не удалось загрузить настройки. Обновите страницу.",
    latest: "Последние уведомления",
    unreadCount: "непрочитано",
    noNew: "Новых уведомлений пока нет.",
    markRead: "Прочитано",
    markAsRead: "Отметить прочитанным",
    markAll: "Прочитать все",
    updating: "Обновление...",
    hide: "Скрыть",
    updateError: "Не удалось обновить уведомление. Попробуйте ещё раз.",
    updateAllError: "Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.",
    allNotifications: "Все уведомления",
    groupOrders: "Заказы",
    groupShipments: "Отгрузки",
    groupAccess: "Доступ сотрудников",
    groupProducts: "Товары и поступления",
    groupCommercial: "Специальные предложения",
    groupDocuments: "Документы",
    groupService: "Сервисные заявки",
    groupDescription: "Системные уведомления помогают не пропустить важные изменения.",
    optional: "Необязательные уведомления",
    enabled: "В приложении включено",
    deliveryMode: "Режим доставки",
    immediate: "Сразу",
    daily: "Ежедневная сводка",
    off: "Выключено",
    emailLater: "Отправка по email будет доступна позже.",
    dailyLater: "Ежедневная сводка будет доступна позже.",
    saved: "Настройки сохранены.",
    saveError: "Не удалось сохранить настройки. Попробуйте ещё раз.",
    severityCritical: "Критично",
    severityWarning: "Важно",
    severityInformation: "Информация",
    severitySuccess: "Выполнено",
  },
  {
    title: "Notificări",
    workspace: "Cabinet de lucru",
    intro: "Modificări importante privind comenzile, livrările și accesul angajaților.",
    settings: "Setări",
    filters: "Filtre pentru notificări",
    filterAll: "Toate",
    filterOrders: "Comenzi",
    filterShipments: "Livrări",
    filterAccess: "Accesul angajaților",
    filterProducts: "Produse",
    filterUnread: "Necitite",
    loadError: "Notificările nu au putut fi încărcate. Actualizați pagina.",
    emptyTitle: "Nu sunt evenimente noi",
    emptyMessage: "Evenimentele noi privind comenzile, livrările și accesul angajaților vor apărea aici.",
    backWorkspace: "Înapoi la cabinetul de lucru",
    unread: "Necitită",
    showMore: "Arată mai multe",
    settingsTitle: "Setări notificări",
    settingsIntro: "Setările se aplică numai profilului dvs. din compania curentă.",
    settingsLoadError: "Setările nu au putut fi încărcate. Actualizați pagina.",
    latest: "Ultimele notificări",
    unreadCount: "necitite",
    noNew: "Nu există notificări noi.",
    markRead: "Citită",
    markAsRead: "Marchează ca citită",
    markAll: "Marchează toate ca citite",
    updating: "Se actualizează...",
    hide: "Ascunde",
    updateError: "Notificarea nu a putut fi actualizată. Încercați din nou.",
    updateAllError: "Notificările nu au putut fi marcate ca citite. Încercați din nou.",
    allNotifications: "Toate notificările",
    groupOrders: "Comenzi",
    groupShipments: "Livrări",
    groupAccess: "Accesul angajaților",
    groupProducts: "Produse și reaprovizionări",
    groupCommercial: "Oferte speciale",
    groupDocuments: "Documente",
    groupService: "Solicitări de service",
    groupDescription: "Notificările de sistem vă ajută să urmăriți modificările importante.",
    optional: "Notificări opționale",
    enabled: "Activate în aplicație",
    deliveryMode: "Mod de livrare",
    immediate: "Imediat",
    daily: "Rezumat zilnic",
    off: "Dezactivate",
    emailLater: "Trimiterea prin email va fi disponibilă ulterior.",
    dailyLater: "Rezumatul zilnic va fi disponibil ulterior.",
    saved: "Setările au fost salvate.",
    saveError: "Setările nu au putut fi salvate. Încercați din nou.",
    severityCritical: "Critic",
    severityWarning: "Important",
    severityInformation: "Informație",
    severitySuccess: "Finalizat",
  },
);

type EventPresentation = { title: string; message: string; action: string | null };

const roEvents: Record<PartnerNotificationEventCode, EventPresentation> = {
  order_submitted: event("Comanda a fost trimisă", "Comanda a fost transmisă către Novotech pentru procesare.", "Deschide comanda"),
  order_confirmed: event("Comanda a fost confirmată", "Starea comenzii a fost actualizată.", "Deschide comanda"),
  order_requires_attention: event("Comanda necesită atenție", "Verificați starea și detaliile comenzii.", "Deschide comanda"),
  order_readback_failed: event("Confirmarea comenzii este indisponibilă", "Verificați comanda sau încercați din nou mai târziu.", "Deschide comanda"),
  order_reconciliation_required: event("Comanda necesită verificare", "Datele comenzii trebuie verificate.", "Deschide comanda"),
  order_posted: event("Comanda a fost înregistrată", "Comanda a fost înregistrată în sistemul Novotech.", "Deschide comanda"),
  order_cancelled: event("Comanda a fost anulată", "Starea comenzii a fost actualizată.", "Deschide comanda"),
  shipment_due_in_3_days: event("Livrare în următoarele trei zile", "Verificați data și starea livrării.", "Deschide livrările"),
  shipment_due_today: event("Livrare planificată astăzi", "Verificați starea actuală a livrării.", "Deschide livrările"),
  shipment_overdue: event("Livrare întârziată", "Livrarea necesită atenție.", "Deschide livrările"),
  shipment_date_changed: event("Data livrării s-a modificat", "Verificați noua dată planificată.", "Deschide livrările"),
  date_change_approved: event("Modificarea datei a fost aprobată", "Data planificată a fost actualizată.", "Deschide comanda"),
  date_change_rejected: event("Modificarea datei a fost respinsă", "Data planificată a rămas neschimbată.", "Deschide comanda"),
  date_change_cancelled: event("Solicitarea de modificare a fost anulată", "Solicitarea nu mai este activă.", "Deschide comanda"),
  invitation_expiring: event("Invitația expiră în curând", "Verificați invitația angajatului.", "Deschide accesul"),
  invitation_accepted: event("Invitația a fost acceptată", "Angajatul a obținut acces la companie.", "Deschide accesul"),
  employee_suspended: event("Accesul angajatului este suspendat", "Verificați accesul angajatului.", "Deschide accesul"),
  role_changed: event("Rolul angajatului s-a modificat", "Drepturile angajatului au fost actualizate.", "Deschide accesul"),
  price_access_changed: event("Accesul la prețuri s-a modificat", "Drepturile comerciale ale angajatului au fost actualizate.", "Deschide accesul"),
  watched_product_back_in_stock: event("Produsul este din nou în stoc", "Un produs urmărit este disponibil.", "Deschide produsul"),
  watched_product_expected_arrival_added: event("A fost adăugată o reaprovizionare", "Pentru un produs urmărit este disponibilă o dată estimată.", "Deschide produsul"),
  watched_product_arrived: event("Produsul a fost reaprovizionat", "Un produs urmărit a ajuns în stoc.", "Deschide produsul"),
  watched_product_price_changed: event("Prețul produsului s-a modificat", "Verificați prețul actual al produsului urmărit.", "Deschide produsul"),
  cart_product_price_changed: event("Prețul unui produs din coș s-a modificat", "Verificați valorile actuale înainte de trimiterea comenzii.", "Deschide coșul"),
  cart_product_availability_changed: event("Disponibilitatea unui produs din coș s-a modificat", "Verificați disponibilitatea actuală înainte de trimiterea comenzii.", "Deschide coșul"),
  campaign_started: event("A început o ofertă specială", "Consultați condițiile ofertei Novotech.", "Deschide oferta"),
  campaign_ending_soon: event("Oferta se încheie în curând", "Consultați termenul și condițiile ofertei.", "Deschide oferta"),
  warehouse_arrival_completed: event("Reaprovizionarea a fost publicată", "Produsele noi sunt disponibile în catalog.", "Deschide catalogul"),
  service_case_created: serviceEvent("Solicitarea de service a fost creată"),
  service_case_accepted: serviceEvent("Solicitarea de service a fost acceptată"),
  service_information_requested: serviceEvent("Sunt necesare informații suplimentare"),
  service_equipment_expected: serviceEvent("Echipamentul este așteptat la service"),
  service_equipment_received: serviceEvent("Echipamentul a fost recepționat"),
  service_diagnosis_started: serviceEvent("Diagnosticarea a început"),
  service_diagnosis_completed: serviceEvent("Diagnosticarea a fost finalizată"),
  service_repair_started: serviceEvent("Reparația a început"),
  service_replacement_approved: serviceEvent("Înlocuirea a fost aprobată"),
  service_replacement_waiting: serviceEvent("Înlocuirea este în așteptare"),
  service_ready_for_pickup: serviceEvent("Echipamentul este gata de ridicare"),
  service_case_closed: serviceEvent("Solicitarea de service a fost închisă"),
  service_case_rejected: serviceEvent("Solicitarea de service a fost respinsă"),
  service_case_cancelled: serviceEvent("Solicitarea de service a fost anulată"),
};

export function presentPartnerNotification(
  notification: PartnerNotification,
  locale: PartnerLocale,
): PartnerNotification {
  const localized = locale === "ro"
    ? roEvents[notification.eventCode as PartnerNotificationEventCode]
    : undefined;
  return {
    ...notification,
    title: localized?.title ?? notification.title,
    message: localized?.message ?? notification.message,
    actionLabel: notification.actionLabel ? localized?.action ?? notification.actionLabel : null,
    relativeTime: formatNotificationTime(notification.occurredAt, locale),
  };
}

function event(title: string, message: string, action: string | null): EventPresentation {
  return { title, message, action };
}

function serviceEvent(title: string): EventPresentation {
  return event(title, "Verificați starea actuală a solicitării de service.", "Deschide solicitarea");
}

function formatNotificationTime(value: string, locale: PartnerLocale): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "";
  const minutes = Math.round((timestamp.getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(partnerLocaleTag(locale), { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  return new Intl.DateTimeFormat(partnerLocaleTag(locale), {
    dateStyle: "medium",
    timeZone: "Europe/Chisinau",
  }).format(timestamp);
}
