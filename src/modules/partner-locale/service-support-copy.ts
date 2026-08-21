import type { ServiceCaseType } from "@/src/modules/service-center/types";
import type {
  SupportPriority,
  SupportStatus,
} from "@/src/modules/partner-support/types";

import { definePartnerCopy } from "./define-copy";
import type { PartnerLocale } from "./locale";
import { partnerStatusLabel } from "./status-copy";

export const serviceCopy = definePartnerCopy(
  {
    eyebrow: "Сервис Novotech",
    title: "Сервис и гарантия",
    description:
      "Проверка гарантии, регистрация обращений и история обслуживания оборудования.",
    create: "Создать заявку",
    warrantyCheck: "Проверка покупки и гарантии",
    historyTitle: "История сервисного обслуживания",
    historyDescription:
      "Заявки из кабинета и подтверждённые сервисные документы Novotech.",
    searchPlaceholder: "Номер, товар или серийный номер",
    historyFilter: "Фильтр истории",
    active: "Активные",
    ready: "Готово к выдаче",
    completed: "Завершённые",
    all: "Все",
    search: "Найти",
    loadError: "Не удалось загрузить историю. Повторите попытку позже.",
    noCases: "Заявок пока нет",
    noCasesHint: "Новая заявка появится здесь после регистрации.",
    productPending: "Товар уточняется",
    unlinked: "Без привязки",
    attention: "Требует внимания",
    status: "Статус",
    product: "Товар",
    serial: "Серийный номер",
    warranty: "Гарантия",
    requiresReview: "Требует проверки",
    descriptionLabel: "Описание",
    symptoms: "Симптомы",
    history: "История",
    materials: "Материалы",
    serviceDocuments: "Сервисные документы",
    backCases: "Все заявки",
    createdOn: "Создана",
    addInformation: "Добавить информацию",
    addMaterials: "Добавить материалы",
    backToCases: "К заявкам",
    newTitle: "Новая сервисная заявка",
    newHint:
      "Привяжите заказ и товар, если они доступны. Серийный номер можно указать вручную для последующей проверки.",
    verifiedHint:
      "Покупка и серийный номер подтверждены. Гарантийное решение остаётся предметом сервисной проверки.",
    prepareError: "Не удалось подготовить форму.",
    document: "Сервисный документ",
    historyBack: "История обслуживания",
  },
  {
    eyebrow: "Service Novotech",
    title: "Service și garanție",
    description:
      "Verificarea garanției, înregistrarea solicitărilor și istoricul de service al echipamentelor.",
    create: "Creează solicitare",
    warrantyCheck: "Verificarea achiziției și garanției",
    historyTitle: "Istoricul lucrărilor de service",
    historyDescription:
      "Solicitări din cabinet și documente de service Novotech confirmate.",
    searchPlaceholder: "Număr, produs sau număr de serie",
    historyFilter: "Filtrul istoricului",
    active: "Active",
    ready: "Gata de ridicare",
    completed: "Finalizate",
    all: "Toate",
    search: "Caută",
    loadError:
      "Istoricul nu a putut fi încărcat. Încercați din nou mai târziu.",
    noCases: "Nu există solicitări",
    noCasesHint: "Solicitarea nouă va apărea aici după înregistrare.",
    productPending: "Produs în curs de clarificare",
    unlinked: "Fără asociere",
    attention: "Necesită atenție",
    status: "Statut",
    product: "Produs",
    serial: "Număr de serie",
    warranty: "Garanție",
    requiresReview: "Necesită verificare",
    descriptionLabel: "Descriere",
    symptoms: "Simptome",
    history: "Istoric",
    materials: "Materiale",
    serviceDocuments: "Documente de service",
    backCases: "Toate solicitările",
    createdOn: "Creată la",
    addInformation: "Adaugă informații",
    addMaterials: "Adaugă materiale",
    backToCases: "Înapoi la solicitări",
    newTitle: "Solicitare nouă de service",
    newHint:
      "Asociați comanda și produsul dacă sunt disponibile. Numărul de serie poate fi introdus manual pentru verificarea ulterioară.",
    verifiedHint:
      "Achiziția și numărul de serie au fost confirmate. Decizia privind garanția rămâne supusă verificării de service.",
    prepareError: "Formularul nu a putut fi pregătit.",
    document: "Document de service",
    historyBack: "Istoric de service",
  },
);

const serviceTypes: Record<PartnerLocale, Record<ServiceCaseType, string>> = {
  ru: {
    warranty_diagnosis: "Гарантийная диагностика",
    repair_request: "Ремонт",
    replacement_request: "Запрос на замену",
    return_request: "Запрос на возврат",
    technical_consultation: "Техническая консультация",
    missing_item_or_accessory: "Недостающая комплектующая",
    other_product_issue: "Другая проблема с товаром",
  },
  ro: {
    warranty_diagnosis: "Diagnostic în garanție",
    repair_request: "Reparație",
    replacement_request: "Solicitare de înlocuire",
    return_request: "Solicitare de retur",
    technical_consultation: "Consultație tehnică",
    missing_item_or_accessory: "Componentă sau accesoriu lipsă",
    other_product_issue: "Altă problemă a produsului",
  },
};

export function serviceTypeLabel(
  locale: PartnerLocale,
  type: ServiceCaseType,
): string {
  return serviceTypes[locale][type];
}

export function serviceStatusLabel(
  locale: PartnerLocale,
  status: string,
): string {
  return partnerStatusLabel(locale, "service", status);
}

export const serviceFormCopy = definePartnerCopy(
  {
    caseType: "Тип обращения",
    order: "Заказ (при наличии)",
    noOrder: "Без привязки к заказу",
    product: "Товар",
    productPending: "Товар будет уточнён",
    orderLine: "Позиция заказа",
    notSelected: "Не выбрана",
    noSku: "Без SKU",
    oneCProduct: "Товар из 1С",
    serial: "Серийный номер",
    serialPlaceholder: "Если известен",
    faultCategory: "Категория неисправности",
    issueStarted: "Когда возникла проблема",
    preferredContact: "Предпочтительный контакт",
    description: "Описание проблемы",
    symptoms: "Наблюдаемые симптомы",
    powersOn: "Оборудование включается?",
    resetDone: "Сброс к заводским настройкам выполнен?",
    consent: "Я согласен на обработку материалов, переданных для диагностики.",
    warrantyHint:
      "При ручном серийном номере гарантия требует проверки Novotech. Возможность прямой замены подтверждается только после диагностики.",
    sending: "Отправка...",
    create: "Создать заявку",
    notProvided: "Не указано",
    yes: "Да",
    no: "Нет",
    additional: "Дополнительная информация",
    send: "Отправить",
    availableActions: "Доступные действия",
    provideInformation: "Отправить уточнение",
    confirmTransfer: "Подтвердить передачу",
    cancel: "Отменить заявку",
    saving: "Сохранение...",
    photoOrDocument: "Фото или документ",
    uploadHint: "JPG, PNG, WEBP или PDF, не более 15 МБ.",
    uploading: "Загрузка...",
    upload: "Загрузить файл",
    uploadSuccess: "Файл загружен.",
    uploadError: "Не удалось загрузить файл. Повторите попытку.",
    actionError:
      "Действие не выполнено. Обновите страницу и повторите попытку.",
  },
  {
    caseType: "Tipul solicitării",
    order: "Comandă (dacă există)",
    noOrder: "Fără asociere cu o comandă",
    product: "Produs",
    productPending: "Produsul va fi clarificat",
    orderLine: "Poziția din comandă",
    notSelected: "Neselectată",
    noSku: "Fără SKU",
    oneCProduct: "Produs din 1C",
    serial: "Număr de serie",
    serialPlaceholder: "Dacă este cunoscut",
    faultCategory: "Categoria defecțiunii",
    issueStarted: "Când a apărut problema",
    preferredContact: "Contact preferat",
    description: "Descrierea problemei",
    symptoms: "Simptome observate",
    powersOn: "Echipamentul pornește?",
    resetDone: "A fost efectuată resetarea la setările din fabrică?",
    consent:
      "Sunt de acord cu prelucrarea materialelor transmise pentru diagnosticare.",
    warrantyHint:
      "Pentru un număr de serie introdus manual, garanția necesită verificare Novotech. Înlocuirea directă se confirmă numai după diagnosticare.",
    sending: "Se trimite...",
    create: "Creează solicitare",
    notProvided: "Nu este indicat",
    yes: "Da",
    no: "Nu",
    additional: "Informații suplimentare",
    send: "Trimite",
    availableActions: "Acțiuni disponibile",
    provideInformation: "Trimite clarificarea",
    confirmTransfer: "Confirmă predarea",
    cancel: "Anulează solicitarea",
    saving: "Se salvează...",
    photoOrDocument: "Fotografie sau document",
    uploadHint: "JPG, PNG, WEBP sau PDF, maximum 15 MB.",
    uploading: "Se încarcă...",
    upload: "Încarcă fișierul",
    uploadSuccess: "Fișier încărcat.",
    uploadError: "Fișierul nu a putut fi încărcat. Încercați din nou.",
    actionError:
      "Acțiunea nu a fost efectuată. Reîmprospătați pagina și încercați din nou.",
  },
);

const warrantyStates: Record<PartnerLocale, Record<string, string>> = {
  ru: {
    eligible: "Гарантия подтверждена",
    expired: "Гарантия истекла",
    serial_not_found: "Серийный номер не найден",
    purchase_not_found: "Покупка не найдена",
    excluded_by_policy: "Не соответствует условиям",
    manually_approved: "Подтверждено специалистом",
    manually_rejected: "Отклонено специалистом",
    verification_required: "Требует проверки",
  },
  ro: {
    eligible: "Garanție confirmată",
    expired: "Garanție expirată",
    serial_not_found: "Numărul de serie nu a fost găsit",
    purchase_not_found: "Achiziția nu a fost găsită",
    excluded_by_policy: "Nu corespunde condițiilor",
    manually_approved: "Confirmat de specialist",
    manually_rejected: "Respins de specialist",
    verification_required: "Necesită verificare",
  },
};

export function warrantyStateLabel(
  locale: PartnerLocale,
  state: string,
): string {
  return (
    warrantyStates[locale][state] ??
    warrantyStates[locale].verification_required
  );
}

export const supportCopy = definePartnerCopy(
  {
    eyebrow: "Помощь Novotech",
    title: "IT-поддержка",
    description: "Помощь с доступом и работой в партнёрской платформе.",
    create: "Новая заявка",
    searchPlaceholder: "Номер или описание",
    active: "Активные",
    waiting: "Ожидают ответа",
    closed: "Решённые и закрытые",
    all: "Все",
    search: "Найти",
    loadError: "Не удалось загрузить заявки. Повторите попытку позже.",
    noTickets: "Заявок пока нет",
    noTicketsHint: "Новая заявка появится здесь после отправки.",
    created: "Заявка создана. Номер сохранён в вашем кабинете.",
    attachmentFailed:
      "Заявка сохранена, но файл не загрузился. Добавьте его ниже повторно.",
    backTickets: "Все заявки",
    reply: "Ответить",
    addMaterial: "Добавить материал",
    newTitle: "Заявка в IT-поддержку",
    newHint:
      "Контактные данные и компания будут добавлены автоматически из вашего профиля.",
    backToTickets: "К заявкам",
    allTickets: "Все заявки",
    openTicket: "Открыть заявку",
  },
  {
    eyebrow: "Ajutor Novotech",
    title: "Suport IT",
    description:
      "Asistență pentru accesul și utilizarea platformei pentru parteneri.",
    create: "Solicitare nouă",
    searchPlaceholder: "Număr sau descriere",
    active: "Active",
    waiting: "Așteaptă răspuns",
    closed: "Soluționate și închise",
    all: "Toate",
    search: "Caută",
    loadError:
      "Solicitările nu au putut fi încărcate. Încercați din nou mai târziu.",
    noTickets: "Nu există solicitări",
    noTicketsHint: "Solicitarea nouă va apărea aici după trimitere.",
    created: "Solicitarea a fost creată. Numărul este salvat în cabinet.",
    attachmentFailed:
      "Solicitarea a fost salvată, dar fișierul nu s-a încărcat. Adăugați-l din nou mai jos.",
    backTickets: "Toate solicitările",
    reply: "Răspunde",
    addMaterial: "Adaugă material",
    newTitle: "Solicitare către suportul IT",
    newHint:
      "Datele de contact și compania vor fi adăugate automat din profilul dvs.",
    backToTickets: "Înapoi la solicitări",
    allTickets: "Toate solicitările",
    openTicket: "Deschide solicitarea",
  },
);

export function supportStatusLabel(
  locale: PartnerLocale,
  status: SupportStatus,
): string {
  return partnerStatusLabel(locale, "support", status);
}

const supportPriorities: Record<
  PartnerLocale,
  Record<SupportPriority, string>
> = {
  ru: { low: "Низкий", medium: "Средний", high: "Высокий" },
  ro: { low: "Scăzută", medium: "Medie", high: "Ridicată" },
};

export function supportPriorityLabel(
  locale: PartnerLocale,
  priority: SupportPriority,
): string {
  return supportPriorities[locale][priority];
}

export const supportFormCopy = definePartnerCopy(
  {
    describe: "Опишите проблему",
    descriptionHint:
      "Опишите, что произошло, какой результат вы ожидали и что мешает продолжить работу.",
    priority: "Приоритет",
    priorityHint:
      "Высокий — работа заблокирована. Средний — есть обходной путь. Низкий — вопрос или небольшое неудобство.",
    attachmentOptional: "Приложение (необязательно)",
    attachmentHint:
      "JPG, PNG, WEBP или PDF, не более 15 МБ. Ошибка загрузки не помешает создать заявку.",
    sending: "Отправка...",
    sendTicket: "Отправить заявку",
    additional: "Дополнительная информация",
    send: "Отправить",
    confirmSolution: "Подтвердить решение",
    moreHelp: "Нужна дополнительная помощь",
    reopen: "Открыть повторно",
    cancel: "Отменить заявку",
    screenshotOrDocument: "Скриншот или документ",
    uploadHint: "JPG, PNG, WEBP или PDF, не более 15 МБ.",
    uploading: "Загрузка...",
    upload: "Загрузить файл",
    uploaded: "Файл загружен.",
    uploadError:
      "Не удалось загрузить файл. Заявка сохранена, повторите загрузку позже.",
    actionError:
      "Действие не выполнено. Обновите страницу и повторите попытку.",
  },
  {
    describe: "Descrieți problema",
    descriptionHint:
      "Descrieți ce s-a întâmplat, ce rezultat ați așteptat și ce vă împiedică să continuați lucrul.",
    priority: "Prioritate",
    priorityHint:
      "Ridicată — lucrul este blocat. Medie — există o soluție temporară. Scăzută — întrebare sau inconvenient minor.",
    attachmentOptional: "Fișier atașat (opțional)",
    attachmentHint:
      "JPG, PNG, WEBP sau PDF, maximum 15 MB. O eroare de încărcare nu va împiedica crearea solicitării.",
    sending: "Se trimite...",
    sendTicket: "Trimite solicitarea",
    additional: "Informații suplimentare",
    send: "Trimite",
    confirmSolution: "Confirmă soluția",
    moreHelp: "Am nevoie de ajutor suplimentar",
    reopen: "Redeschide",
    cancel: "Anulează solicitarea",
    screenshotOrDocument: "Captură de ecran sau document",
    uploadHint: "JPG, PNG, WEBP sau PDF, maximum 15 MB.",
    uploading: "Se încarcă...",
    upload: "Încarcă fișierul",
    uploaded: "Fișier încărcat.",
    uploadError:
      "Fișierul nu a putut fi încărcat. Solicitarea este salvată; repetați încărcarea mai târziu.",
    actionError:
      "Acțiunea nu a fost efectuată. Reîmprospătați pagina și încercați din nou.",
  },
);
