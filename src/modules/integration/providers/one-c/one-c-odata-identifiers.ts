export const ONE_C_RESOURCES = {
  partners: "Catalog_Контрагенты",
  contracts: "Catalog_ДоговорыКонтрагентов",
  priceTypes: "Catalog_ВидыЦен",
} as const;

export const ONE_C_PARTNER_FIELDS = [
  "Ref_Key",
  "Code",
  "Description",
  "НаименованиеПолное",
  "ИНН",
  "Покупатель",
  "Поставщик",
  "Недействителен",
  "DeletionMark",
  "IsFolder",
] as const;

export const ONE_C_CONTRACT_FIELDS = [
  "Ref_Key",
  "Code",
  "Description",
  "Owner",
  "Owner_Type",
  "НомерДоговора",
  "ДатаДоговора",
  "ВидДоговора",
  "ВидЦен_Key",
  "ВидЦенКонтрагента_Key",
  "Организация_Key",
  "Недействителен",
  "DeletionMark",
] as const;

export const ONE_C_PRICE_TYPE_FIELDS = [
  "Ref_Key",
  "Code",
  "Description",
  "ВалютаЦены_Key",
  "ЦенаВключаетНДС",
  "ТипВидаЦен",
  "ЦеныАктуальны",
  "DeletionMark",
] as const;
