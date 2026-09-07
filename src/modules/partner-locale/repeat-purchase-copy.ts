import { definePartnerCopy } from "./define-copy";

export const repeatPurchaseCopy = definePartnerCopy(
  {
    title: "Вы покупали ранее",
    allCategories: "Все",
    searchLabel: "Поиск по истории покупок",
    searchPlaceholder: "SKU, модель или название",
    search: "Найти",
    clearSearch: "Сбросить",
    products: "товаров",
    unavailableTitle: "История покупок недоступна",
    unavailableMessage: "Не удалось загрузить ранее приобретённые товары. Обновите страницу.",
    emptyTitle: "Товары не найдены",
    emptyMessage: "В завершённых заказах нет товаров, соответствующих выбранному фильтру.",
    pages: "Страницы истории покупок",
  },
  {
    title: "Produse cumpărate anterior",
    allCategories: "Toate",
    searchLabel: "Căutare în istoricul achizițiilor",
    searchPlaceholder: "Cod, model sau denumire",
    search: "Caută",
    clearSearch: "Resetează",
    products: "produse",
    unavailableTitle: "Istoricul achizițiilor nu este disponibil",
    unavailableMessage: "Produsele cumpărate anterior nu au putut fi încărcate. Reîmprospătați pagina.",
    emptyTitle: "Nu au fost găsite produse",
    emptyMessage: "Comenzile finalizate nu conțin produse care corespund filtrului selectat.",
    pages: "Paginile istoricului achizițiilor",
  },
);
