import { definePartnerCopy } from "./define-copy";

const ru = {
    title: "Цены поставщиков", subtitle: "Загружайте прайс-листы поставщиков и сопоставляйте эквивалентные уровни цен.",
    upload: "Загрузить прайс", source: "Источник", file: "Файл XLSX или CSV", priceType: "Тип цены",
    partnerPrice: "Партнёрская цена", retailPrice: "Розничная цена", bothPrices: "Партнёрская + розничная", detect: "Определить из файла",
    fullSnapshot: "Полный прайс", partialUpdate: "Частичное обновление", effectiveDate: "Дата прайса", currency: "Валюта",
    imports: "Импорты", noImports: "Прайс-листы ещё не загружены.", open: "Открыть", status: "Статус",
    uploaded: "Загружен", analyzing: "Анализируется", mapping_required: "Подтвердите колонки", ready_for_review: "Готов к проверке", applied: "Применён", failed: "Ошибка обработки", archived: "Архивирован",
    totalRows: "Всего строк", dahuaCandidates: "Кандидатов Dahua", matched: "Сопоставлено", review: "Требуют проверки", unmatched: "Не найдено", ignored: "Исключено не-Dahua", markers: "Цен с примечаниями",
    mapping: "Сопоставление колонок", productCode: "Код товара", productName: "Модель / товар", description: "Описание", partnerPriceColumn: "Партнёрская цена", retailPriceColumn: "Розничная цена", saveTemplate: "Сохранить шаблон источника", confirmMapping: "Подтвердить и продолжить",
    apply: "Применить", archive: "Архивировать", correctImport: "Исправить импорт", correctionReason: "Причина исправления", correctionReasonPlaceholder: "Укажите, что было классифицировано неверно", startCorrection: "Пересчитать предварительный просмотр", skip: "Пропустить", confirmMatch: "Подтвердить", rows: "Строки прайса", suggested: "Возможные товары", none: "Нет", refresh: "Обновить статус", priceConflict: "Для одного товара найдены разные цены. Подтвердите одну авторитетную строку, остальные пропустите и повторите применение.",
    uploadQueued: "Файл принят и передан на анализ.", mappingQueued: "Сопоставление сохранено. Анализ продолжится в фоне.", appliedMessage: "Проверенные цены применены.", archivedMessage: "Импорт скрыт из рабочего списка.",
    competitorPrices: "Цены поставщиков", yourPrice: "Ваша цена", novotechCheaper: "Novotech дешевле на", sourceCheaper: "дешевле на", comparable: "Цена сопоставима", priceFrom: "Прайс от", noComparisons: "Для этого товара нет применённых цен поставщиков.",
  } as const;
const ro: { [Key in keyof typeof ru]: string } = {
    title: "Prețurile furnizorilor", subtitle: "Încărcați liste de prețuri și comparați niveluri de preț echivalente.",
    upload: "Încarcă lista de prețuri", source: "Sursa", file: "Fișier XLSX sau CSV", priceType: "Tipul prețului",
    partnerPrice: "Preț de partener", retailPrice: "Preț cu amănuntul", bothPrices: "Partener + amănuntul", detect: "Detectează din fișier",
    fullSnapshot: "Listă completă", partialUpdate: "Actualizare parțială", effectiveDate: "Data listei", currency: "Moneda",
    imports: "Importuri", noImports: "Nu au fost încărcate liste de prețuri.", open: "Deschide", status: "Statut",
    uploaded: "Încărcat", analyzing: "Se analizează", mapping_required: "Confirmați coloanele", ready_for_review: "Gata de verificare", applied: "Aplicat", failed: "Eroare de procesare", archived: "Arhivat",
    totalRows: "Total rânduri", dahuaCandidates: "Candidați Dahua", matched: "Potrivite", review: "Necesită verificare", unmatched: "Negăsite", ignored: "Non-Dahua excluse", markers: "Prețuri cu note",
    mapping: "Maparea coloanelor", productCode: "Cod produs", productName: "Model / produs", description: "Descriere", partnerPriceColumn: "Preț de partener", retailPriceColumn: "Preț cu amănuntul", saveTemplate: "Salvează șablonul sursei", confirmMapping: "Confirmă și continuă",
    apply: "Aplică", archive: "Arhivează", correctImport: "Corectează importul", correctionReason: "Motivul corectării", correctionReasonPlaceholder: "Indicați ce a fost clasificat incorect", startCorrection: "Recalculează previzualizarea", skip: "Omite", confirmMatch: "Confirmă", rows: "Rândurile listei", suggested: "Produse posibile", none: "Nu există", refresh: "Actualizează statutul", priceConflict: "Pentru același produs au fost găsite prețuri diferite. Confirmați un singur rând autoritativ, omiteți celelalte rânduri și aplicați din nou lista.",
    uploadQueued: "Fișierul a fost primit și transmis pentru analiză.", mappingQueued: "Maparea a fost salvată. Analiza continuă în fundal.", appliedMessage: "Prețurile verificate au fost aplicate.", archivedMessage: "Importul a fost ascuns din lista de lucru.",
    competitorPrices: "Prețurile furnizorilor", yourPrice: "Prețul dvs.", novotechCheaper: "Novotech este mai ieftin cu", sourceCheaper: "este mai ieftin cu", comparable: "Preț comparabil", priceFrom: "Listă din", noComparisons: "Nu există prețuri aplicate pentru acest produs.",
  };

export const getExternalPricesCopy = definePartnerCopy(ru, ro);
