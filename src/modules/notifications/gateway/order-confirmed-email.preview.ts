export const orderConfirmedEmailPreviewFixtures = {
  ru: {
    locale: "ru",
    customerName: "Василий",
    companyName: "INNOVA SECURITY",
    portalOrderId: "11111111-1111-4111-8111-111111111111",
    oneCOrderNumber: "NSUU-002351",
    orderDate: "2026-08-28T10:00:00.000Z",
    requestedDeliveryDate: "2026-08-28",
    confirmedDeliveryDate: "2026-08-28",
    paymentMethod: "cashless",
    paymentCalendar: [{ date: "2026-08-31", amount: 372.06, currency: "USD" }],
    orderTotal: 372.06,
    currency: "USD",
    orderPath: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
    manager: {
      name: "Анастасия Новак",
      phone: "+373 60 123 456",
      email: "manager@nsd.md",
    },
  },
  ro: {
    locale: "ro",
    customerName: "Vasili",
    companyName: "INNOVA SECURITY",
    portalOrderId: "11111111-1111-4111-8111-111111111111",
    oneCOrderNumber: "NSUU-002351",
    orderDate: "2026-08-28T10:00:00.000Z",
    requestedDeliveryDate: "2026-08-28",
    confirmedDeliveryDate: "2026-08-28",
    paymentMethod: "cashless",
    paymentCalendar: [{ date: "2026-08-31", amount: 372.06, currency: "USD" }],
    orderTotal: 372.06,
    currency: "USD",
    orderPath: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
    manager: {
      name: "Anastasia Novac",
      phone: "+373 60 123 456",
      email: "manager@nsd.md",
    },
  },
} as const;

export const orderConfirmedEmailOptionalPreviewFixtures = {
  noName: { ...orderConfirmedEmailPreviewFixtures.ru, customerName: null },
  noManager: { ...orderConfirmedEmailPreviewFixtures.ru, manager: null },
  noConfirmedShipment: {
    ...orderConfirmedEmailPreviewFixtures.ru,
    confirmedDeliveryDate: null,
  },
  noPaymentSchedule: {
    ...orderConfirmedEmailPreviewFixtures.ru,
    paymentCalendar: [],
  },
} as const;
