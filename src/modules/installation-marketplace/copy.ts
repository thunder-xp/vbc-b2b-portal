import type { InstallationDeclineReason, InstallationNeedType, InstallationObjectType, InstallationProjectStatus } from "./types";

export type InstallationMarketplaceLocale = "ru" | "ro";

export const marketplaceCopy = {
  ru: {
    title: "Монтаж", newProject: "Новая заявка", create: "Создать заявку", projects: "Мои проекты монтажа",
    empty: "У вас пока нет проектов монтажа.", selectPartner: "Выбрать установщика", consent: "Я согласен передать выбранному партнёру мои контактные данные после принятия заявки.",
    locality: "Населённый пункт", objectType: "Тип объекта", needType: "Что требуется", description: "Краткое описание",
    partnerPending: "Ожидаем ответа партнёра", confirmedReview: "Подтверждённый отзыв", noReviews: "Пока нет подтверждённых отзывов",
    choose: "Выбрать", confirm: "Монтаж завершён", dispute: "Сообщить о проблеме", cancel: "Отменить проект",
    leaveReview: "Оставить подтверждённый отзыв", rating: "Оценка", workmanship: "Качество работ", communication: "Коммуникация", agreement: "Соблюдение договорённостей", comment: "Комментарий", publishReview: "Опубликовать отзыв",
    new: "Новые", active: "Активные", completed: "Завершённые", accept: "Принять", decline: "Отклонить", contacted: "Связались", scheduled: "Запланировано", installed: "Монтаж выполнен", plannedFor: "Плановая дата",
  },
  ro: {
    title: "Instalare", newProject: "Cerere nouă", create: "Creează cererea", projects: "Proiectele mele de instalare",
    empty: "Nu aveți încă proiecte de instalare.", selectPartner: "Alege instalatorul", consent: "Sunt de acord ca datele mele de contact să fie transmise partenerului selectat după acceptarea cererii.",
    locality: "Localitate", objectType: "Tipul obiectului", needType: "Serviciul necesar", description: "Descriere scurtă",
    partnerPending: "Așteptăm răspunsul partenerului", confirmedReview: "Recenzie verificată", noReviews: "Nu există încă recenzii verificate",
    choose: "Alege", confirm: "Instalarea este finalizată", dispute: "Raportează o problemă", cancel: "Anulează proiectul",
    leaveReview: "Lasă o recenzie verificată", rating: "Evaluare", workmanship: "Calitatea lucrării", communication: "Comunicare", agreement: "Respectarea acordului", comment: "Comentariu", publishReview: "Publică recenzia",
    new: "Noi", active: "Active", completed: "Finalizate", accept: "Acceptă", decline: "Refuză", contacted: "Contactat", scheduled: "Programat", installed: "Instalare finalizată", plannedFor: "Data planificată",
  },
} as const;

export const objectLabels: Record<InstallationMarketplaceLocale, Record<InstallationObjectType,string>> = {
  ru: { APARTMENT:"Квартира",HOUSE:"Дом",OFFICE:"Офис",SHOP:"Магазин",WAREHOUSE:"Склад",OTHER:"Другое" },
  ro: { APARTMENT:"Apartament",HOUSE:"Casă",OFFICE:"Oficiu",SHOP:"Magazin",WAREHOUSE:"Depozit",OTHER:"Altul" },
};
export const needLabels: Record<InstallationMarketplaceLocale, Record<InstallationNeedType,string>> = {
  ru: { INSTALL_PURCHASED_EQUIPMENT:"Установить купленное оборудование",DESIGN_AND_INSTALL:"Спроектировать и установить",CONSULTATION:"Консультация" },
  ro: { INSTALL_PURCHASED_EQUIPMENT:"Instalarea echipamentului cumpărat",DESIGN_AND_INSTALL:"Proiectare și instalare",CONSULTATION:"Consultație" },
};
export const statusLabels: Record<InstallationMarketplaceLocale, Record<InstallationProjectStatus,string>> = {
  ru: { DRAFT:"Черновик",PARTNER_PENDING:"Ожидает партнёра",PARTNER_ACCEPTED:"Принято партнёром",CONTACTED:"Связались",SCHEDULED:"Запланировано",INSTALLED:"Монтаж заявлен выполненным",CUSTOMER_CONFIRMED:"Подтверждено клиентом",CLOSED:"Закрыто",PARTNER_DECLINED:"Партнёр отказался",CANCELLED:"Отменено",EXPIRED:"Истекло",DISPUTED:"Есть спор" },
  ro: { DRAFT:"Ciornă",PARTNER_PENDING:"În așteptarea partenerului",PARTNER_ACCEPTED:"Acceptat de partener",CONTACTED:"Contactat",SCHEDULED:"Programat",INSTALLED:"Instalare declarată finalizată",CUSTOMER_CONFIRMED:"Confirmat de client",CLOSED:"Închis",PARTNER_DECLINED:"Refuzat de partener",CANCELLED:"Anulat",EXPIRED:"Expirat",DISPUTED:"În dispută" },
};
export const declineLabels: Record<InstallationMarketplaceLocale, Record<InstallationDeclineReason,string>> = {
  ru: { OUT_OF_AREA:"Вне зоны обслуживания",NO_CAPACITY:"Нет свободной мощности",NOT_MY_SPECIALIZATION:"Не наша специализация",TIMING:"Не подходят сроки",OTHER:"Другое" },
  ro: { OUT_OF_AREA:"În afara zonei",NO_CAPACITY:"Fără capacitate disponibilă",NOT_MY_SPECIALIZATION:"Nu este specializarea noastră",TIMING:"Termen nepotrivit",OTHER:"Alt motiv" },
};
