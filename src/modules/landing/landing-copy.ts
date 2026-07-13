import type { PublicLocale } from "@/src/modules/public-locale";

type LandingCopy = {
  navigation: Array<{ href: string; label: string }>;
  language: {
    label: string;
    options: Record<PublicLocale, string>;
  };
  signIn: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    becomePartner: string;
    trustItems: string[];
  };
  workspace: {
    title: string;
    features: string[];
    stockTitle: string;
    fulfillmentTitle: string;
    fulfillmentText: string;
  };
  capabilities: string[];
};

export const landingCopy: Record<PublicLocale, LandingCopy> = {
  ru: {
    navigation: [
      { href: "#platform", label: "Платформа" },
      { href: "#workspace", label: "Каталог" },
      { href: "#documents", label: "Документы" },
      { href: "#support", label: "Поддержка" },
    ],
    language: {
      label: "Выбрать язык",
      options: { ru: "Русский", ro: "Română" },
    },
    signIn: "Войти",
    hero: {
      eyebrow: "Платформа для дистрибуционных партнёров",
      title: "Партнёрская платформа Novotech",
      description:
        "Безопасный B2B-кабинет для работы с каталогом, индивидуальными ценами, наличием, спецификациями, документами и запросами на резерв.",
      becomePartner: "Стать партнёром",
      trustItems: [
        "Безопасный доступ",
        "Партнёрские цены",
        "Актуальные остатки",
        "Поддержка Novotech",
      ],
    },
    workspace: {
      title: "Добро пожаловать в кабинет партнёра",
      features: [
        "Каталог B2B",
        "Партнёрские цены",
        "Наличие и поступления",
        "Проектные спецификации",
        "Запросы на резерв",
        "Документы",
      ],
      stockTitle: "Наличие",
      fulfillmentTitle: "Надёжность поставок",
      fulfillmentText: "Актуальные данные из 1С",
    },
    capabilities: [
      "Видеонаблюдение",
      "СКУД",
      "Сигнализация",
      "Сети",
      "Домофония",
      "Комплексные решения",
    ],
  },
  ro: {
    navigation: [
      { href: "#platform", label: "Platformă" },
      { href: "#workspace", label: "Catalog" },
      { href: "#documents", label: "Documente" },
      { href: "#support", label: "Suport" },
    ],
    language: {
      label: "Selectați limba",
      options: { ru: "Русский", ro: "Română" },
    },
    signIn: "Autentificare",
    hero: {
      eyebrow: "Platformă pentru partenerii de distribuție",
      title: "Platforma Partenerilor Novotech",
      description:
        "Un cabinet B2B sigur pentru catalog, prețuri individuale, stocuri, specificații, documente și cereri de rezervare.",
      becomePartner: "Devino partener",
      trustItems: [
        "Acces securizat",
        "Prețuri pentru parteneri",
        "Stocuri actualizate",
        "Suport Novotech",
      ],
    },
    workspace: {
      title: "Bine ați venit în cabinetul partenerului",
      features: [
        "Catalog B2B",
        "Prețuri pentru parteneri",
        "Stocuri și livrări",
        "Specificații de proiect",
        "Cereri de rezervare",
        "Documente",
      ],
      stockTitle: "Stoc",
      fulfillmentTitle: "Fiabilitatea livrărilor",
      fulfillmentText: "Date actualizate din 1C",
    },
    capabilities: [
      "Supraveghere video",
      "Control acces",
      "Sisteme de alarmă",
      "Rețelistică",
      "Interfonie",
      "Soluții integrate",
    ],
  },
};
