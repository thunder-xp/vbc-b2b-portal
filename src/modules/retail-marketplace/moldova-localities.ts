type SupportedLocale = "ru" | "ro";

export const OTHER_LOCALITY_CODE = "other";

// Governed customer-facing subset of Moldova's current CUATM localities (BNS, 21 October 2025).
export const MOLDOVA_PRIMARY_LOCALITIES = [
  ["chisinau", "Кишинёв", "Chișinău"],
  ["balti", "Бельцы", "Bălți"],
  ["cahul", "Кагул", "Cahul"],
  ["comrat", "Комрат", "Comrat"],
  ["orhei", "Оргеев", "Orhei"],
  ["soroca", "Сороки", "Soroca"],
  ["ungheni", "Унгены", "Ungheni"],
  ["edinet", "Единцы", "Edineț"],
  ["hincesti", "Хынчешты", "Hîncești"],
  ["straseni", "Страшены", "Strășeni"],
  ["anenii-noi", "Новые Анены", "Anenii Noi"],
  ["basarabeasca", "Бессарабка", "Basarabeasca"],
  ["briceni", "Бричаны", "Briceni"],
  ["calarasi", "Кэлэрашь", "Călărași"],
  ["causeni", "Кэушень", "Căușeni"],
  ["ceadir-lunga", "Чадыр-Лунга", "Ceadîr-Lunga"],
  ["cimislia", "Чимишлия", "Cimișlia"],
  ["criuleni", "Криуляны", "Criuleni"],
  ["drochia", "Дрокия", "Drochia"],
  ["dubasari", "Дубоссары", "Dubăsari"],
  ["falesti", "Фалешты", "Fălești"],
  ["floresti", "Флорешты", "Florești"],
  ["glodeni", "Глодяны", "Glodeni"],
  ["ialoveni", "Яловены", "Ialoveni"],
  ["leova", "Леова", "Leova"],
  ["nisporeni", "Ниспорены", "Nisporeni"],
  ["ocnita", "Окница", "Ocnița"],
  ["rezina", "Резина", "Rezina"],
  ["riscani", "Рышканы", "Rîșcani"],
  ["singerei", "Сынжерей", "Sîngerei"],
  ["soldanesti", "Шолданешты", "Șoldănești"],
  ["stefan-voda", "Штефан-Водэ", "Ștefan Vodă"],
  ["taraclia", "Тараклия", "Taraclia"],
  ["telenesti", "Теленешты", "Telenești"],
  ["vulcanesti", "Вулканешты", "Vulcănești"],
] as const;

export type MoldovaLocalityCode = (typeof MOLDOVA_PRIMARY_LOCALITIES)[number][0];

export function localityLabel(code: MoldovaLocalityCode, locale: SupportedLocale): string {
  const locality = MOLDOVA_PRIMARY_LOCALITIES.find(([candidate]) => candidate === code);
  if (!locality) throw new Error("Unknown governed locality.");
  return locale === "ru" ? locality[1] : locality[2];
}

export function resolveSubmittedLocality(input: {
  code: string;
  locale: SupportedLocale;
  manualValue: string;
}): string | null {
  if (input.code === OTHER_LOCALITY_CODE) {
    const manual = input.manualValue.trim().replace(/\s+/g, " ");
    return manual.length >= 2 && manual.length <= 120 ? manual : null;
  }
  const locality = MOLDOVA_PRIMARY_LOCALITIES.find(([code]) => code === input.code);
  return locality ? (input.locale === "ru" ? locality[1] : locality[2]) : null;
}
