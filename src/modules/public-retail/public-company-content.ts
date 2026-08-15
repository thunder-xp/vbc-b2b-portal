import type { PublicRetailLocale } from "./types";

type LocalizedValue = Record<PublicRetailLocale, string>;

export const publicCompanyContent = {
  descriptor: {
    ru: "Прямой импортёр оборудования и решений для безопасности",
    ro: "Importator direct de echipamente și soluții de securitate",
  } satisfies LocalizedValue,
  email: "info@nsd.md",
  customerPhone: { display: "0 78 999 484", href: "tel:+37378999484" },
  hours: {
    weekdays: { ru: "Пн–Пт: 09:00–18:00", ro: "Lun–Vin: 09:00–18:00" },
    saturday: { ru: "Сб: 10:00–14:00", ro: "Sâm: 10:00–14:00" },
  },
  stores: [
    {
      city: { ru: "Кишинёв", ro: "Chișinău" },
      address: { ru: "ул. Лев Толстой, 4", ro: "str. Lev Tolstoi 4" },
      mapsHref: "https://www.google.com/maps/search/?api=1&query=str.%20Lev%20Tolstoi%204%2C%20Chi%C8%99in%C4%83u%2C%20Moldova",
      phone: { display: "0 78 999 484", href: "tel:+37378999484" },
    },
    {
      city: { ru: "Бельцы", ro: "Bălți" },
      address: { ru: "ул. Думитру Карачобану, 118", ro: "str. Dumitru Caraciobanu 118" },
      mapsHref: "https://www.google.com/maps/search/?api=1&query=str.%20Dumitru%20Caraciobanu%20118%2C%20B%C4%83l%C8%9Bi%2C%20Moldova",
      phone: { display: "0 78 999 495", href: "tel:+37378999495" },
    },
  ],
} as const;
