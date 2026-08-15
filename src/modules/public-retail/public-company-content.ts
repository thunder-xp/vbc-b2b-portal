import type { PublicRetailLocale } from "./types";

type LocalizedValue = Record<PublicRetailLocale, string>;

export const publicCompanyContent = {
  descriptor: {
    ru: "Прямой импортёр оборудования и решений для безопасности",
    ro: "Importator direct de echipamente și soluții de securitate",
  } satisfies LocalizedValue,
  email: "info@nsd.md",
  customerPhone: "0 78 999 484",
  hours: {
    weekdays: { ru: "Пн–Пт: 09:00–18:00", ro: "Lun–Vin: 09:00–18:00" },
    saturday: { ru: "Сб: 10:00–14:00", ro: "Sâm: 10:00–14:00" },
  },
  stores: [
    {
      city: { ru: "Кишинёв", ro: "Chișinău" },
      address: { ru: "ул. Лев Толстой, 4", ro: "str. Lev Tolstoi 4" },
      phone: "0 78 999 484",
    },
    {
      city: { ru: "Бельцы", ro: "Bălți" },
      address: { ru: "ул. Думитру Карачобану, 118", ro: "str. Dumitru Caraciobanu 118" },
      phone: "0 78 999 495",
    },
  ],
} as const;
