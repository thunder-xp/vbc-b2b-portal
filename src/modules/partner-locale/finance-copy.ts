import { definePartnerCopy } from "./define-copy";

export const getFinanceCopy = definePartnerCopy(
  {
    title: "Финансы",
    cabinet: "Партнёрский кабинет",
    description:
      "Суммы к оплате и авансы по действующим договорам в исходной валюте.",
    unavailable:
      "Финансовые данные недоступны. Проверьте права доступа или обратитесь в Novotech.",
    documents: "Финансовые документы",
    documentsEmpty:
      "Счета, акты и договоры появятся после безопасной синхронизации метаданных.",
    contractSummary: "Сводка по договорам",
    activeContracts: "Активные договоры с балансом",
    updated: "Обновлено",
    currencyTotals: "Итоги по валютам",
    amountDue: "К оплате",
    advance: "Аванс",
    contractBalance: "Баланс по договорам",
    noBalances: "Нет ненулевых балансов",
    noBalancesText: "По активным договорам задолженность и аванс отсутствуют.",
    neverLoaded: "Финансовые данные ещё не загружены",
    neverLoadedText: "Данные по взаиморасчётам пока не синхронизированы с 1С.",
    mappingMissing: "Финансовые данные недоступны",
    mappingMissingText:
      "Для компании ещё не настроена связь с учётной системой. Обратитесь к менеджеру Novotech.",
    temporarilyUnavailable: "Финансовые данные временно недоступны",
    temporarilyUnavailableText:
      "Последние подтверждённые данные отсутствуют. Повторите попытку позже или обратитесь в Novotech.",
    refresh: "Обновить из 1С",
    refreshing: "Обновление...",
    syncFailed:
      "Не удалось обновить финансовые данные. Последние подтверждённые данные сохранены.",
    syncLocked: "Обновление уже выполняется. Дождитесь завершения.",
    syncMappingMissing:
      "Для компании не настроена связь с 1С. Обратитесь к менеджеру Novotech.",
    syncZero: "Данные обновлены. Ненулевых балансов нет.",
    syncSuccess: "Финансовые данные обновлены из 1С.",
  } as const,
  {
    title: "Finanțe",
    cabinet: "Cabinetul partenerului",
    description:
      "Sumele de achitat și avansurile pentru contractele active, în moneda inițială.",
    unavailable:
      "Datele financiare sunt indisponibile. Verificați drepturile de acces sau contactați Novotech.",
    documents: "Documente financiare",
    documentsEmpty:
      "Facturile, actele și contractele vor apărea după sincronizarea securizată a metadatelor.",
    contractSummary: "Rezumatul contractelor",
    activeContracts: "Contracte active cu sold",
    updated: "Actualizat",
    currencyTotals: "Totaluri pe valute",
    amountDue: "De achitat",
    advance: "Avans",
    contractBalance: "Sold pe contracte",
    noBalances: "Nu există solduri nenule",
    noBalancesText: "Contractele active nu au datorii sau avansuri.",
    neverLoaded: "Datele financiare nu au fost încă încărcate",
    neverLoadedText:
      "Datele privind decontările nu au fost încă sincronizate cu 1C.",
    mappingMissing: "Datele financiare sunt indisponibile",
    mappingMissingText:
      "Legătura companiei cu sistemul contabil nu este încă configurată. Contactați managerul Novotech.",
    temporarilyUnavailable: "Datele financiare sunt temporar indisponibile",
    temporarilyUnavailableText:
      "Nu există date confirmate anterior. Încercați din nou mai târziu sau contactați Novotech.",
    refresh: "Actualizează din 1C",
    refreshing: "Se actualizează...",
    syncFailed:
      "Datele financiare nu au putut fi actualizate. Ultimele date confirmate au fost păstrate.",
    syncLocked: "Actualizarea este deja în curs. Așteptați finalizarea.",
    syncMappingMissing:
      "Legătura companiei cu 1C nu este configurată. Contactați managerul Novotech.",
    syncZero: "Datele au fost actualizate. Nu există solduri nenule.",
    syncSuccess: "Datele financiare au fost actualizate din 1C.",
  },
);
