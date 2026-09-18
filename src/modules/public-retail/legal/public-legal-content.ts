import type { PublicRetailLocale } from "../types";

export const PUBLIC_TERMS_VERSION = "2026-09-18";
export const PUBLIC_PRIVACY_VERSION = "2026-09-18";
export const PUBLIC_LEGAL_EFFECTIVE_AT = "2026-09-18T00:00:00+03:00";

type MerchantLegalProfile = Readonly<{
  legalName: string | null;
  idno: string | null;
  registeredAddress: Readonly<Record<PublicRetailLocale, string>> | null;
  ownerInputRequired: readonly ("legalName" | "idno" | "registeredAddress")[];
}>;

export const publicMerchantLegalProfile: MerchantLegalProfile = Object.freeze({
  legalName: null,
  idno: null,
  registeredAddress: null,
  ownerInputRequired: ["legalName", "idno", "registeredAddress"] as const,
});

export const publicPaymentBranding = Object.freeze({
  maib: true,
  supportedInternationalPaymentSystems: [] as readonly ("visa" | "mastercard" | "amex")[],
  maibLiberApplicable: "UNKNOWN" as const,
});

type LegalSection = Readonly<{ title: string; paragraphs: readonly string[] }>;
type LegalDocument = Readonly<{
  eyebrow: string;
  title: string;
  summary: string;
  version: string;
  effectiveAt: string;
  sections: readonly LegalSection[];
}>;

export const legalDocuments: Record<"terms" | "privacy" | "delivery" | "returns", Record<PublicRetailLocale, LegalDocument>> = {
  terms: {
    ru: {
      eyebrow: "ПРАВОВАЯ ИНФОРМАЦИЯ",
      title: "Условия и положения",
      summary: "Правила использования публичного магазина Novotech, оформления заказов и оплаты товаров и услуг.",
      version: PUBLIC_TERMS_VERSION,
      effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT,
      sections: [
        { title: "1. Общие положения", paragraphs: ["Эти условия регулируют использование публичного сайта nsd.md, оформление розничного заказа и взаимодействие клиента с Novotech.", "Оформляя заказ, клиент подтверждает, что предоставленные им контактные и адресные данные являются достоверными."] },
        { title: "2. Продавец и контакты", paragraphs: ["Публичный бренд продавца — Novotech. Контактные данные и адреса магазинов опубликованы на странице «Контакты»."] },
        { title: "3. Товары и услуги", paragraphs: ["Каталог содержит оборудование, материалы и связанные услуги для систем безопасности. Актуальные состав, цена и доступность показываются до оформления заказа.", "Параметры монтажа и окончательные условия работ согласовываются с учётом объекта; сайт не обещает неподтверждённые сроки или стоимость работ."] },
        { title: "4. Оформление заказа", paragraphs: ["Клиент выбирает товары, проверяет состав корзины и передаёт необходимые контактные и адресные данные. Заказ создаётся по актуальному коммерческому снимку и получает уникальный номер.", "Если цена, доступность или состав изменились, заказ не создаётся по устаревшим данным."] },
        { title: "5. Способы и условия оплаты", paragraphs: ["Доступные способы оплаты показываются в интерфейсе заказа. Онлайн-оплата картой становится доступной только после активации соответствующей функции Novotech.", "Сумма онлайн-платежа формируется на сервере из подтверждённого состава заказа и не принимается из браузера."] },
        { title: "6. Онлайн-оплата через MAIB", paragraphs: ["При выборе оплаты картой клиент переходит на защищённую страницу MAIB. Novotech не получает и не хранит номер карты, CVV/CVC или данные авторизации карты.", "Возврат браузера на nsd.md сам по себе не подтверждает оплату. Статус меняется только после проверенного подтверждения платёжного провайдера."] },
        { title: "7. Персональные данные", paragraphs: ["Данные обрабатываются для оформления и исполнения заказа, связи с клиентом, доставки, монтажа, сервиса и подтверждения оплаты. Подробнее — в Политике конфиденциальности."] },
        { title: "8. Доставка и получение", paragraphs: ["Доступны получение в магазинах Novotech и согласованная доставка в Молдове. Конкретные условия подтверждаются при обработке заказа и описаны на странице «Доставка»."] },
        { title: "9. Отмена и возврат", paragraphs: ["Запрос на отмену или возврат направляется Novotech по публичным контактам. Применимость, состояние товара и последующие действия проверяются до возврата товара или денежных средств.", "Подробный порядок опубликован на странице «Возврат»; неподтверждённые сроки и исключения на сайте не устанавливаются."] },
        { title: "10. Гарантия", paragraphs: ["Гарантийные обращения рассматриваются по документам покупки и условиям, применимым к конкретному товару или услуге. Клиент может обратиться в сервис Novotech по публичным контактам."] },
        { title: "11. Обязанности клиента", paragraphs: ["Клиент проверяет состав заказа, предоставляет корректные контакты и адрес, соблюдает инструкции по эксплуатации и сообщает об ошибках до подтверждения заказа или выполнения работ."] },
        { title: "12. Обязанности продавца", paragraphs: ["Novotech предоставляет достоверную доступную информацию, сохраняет коммерческий снимок заказа и не признаёт оплату без авторитетного подтверждения платёжной системы."] },
        { title: "13. Связь", paragraphs: ["Телефон: 0 79 31 33 53. Email: info@nsd.md. Адреса магазинов и часы работы доступны на странице «Контакты»."] },
      ],
    },
    ro: {
      eyebrow: "INFORMAȚII JURIDICE",
      title: "Termeni și condiții",
      summary: "Regulile de utilizare a magazinului public Novotech, de plasare a comenzilor și de achitare a produselor și serviciilor.",
      version: PUBLIC_TERMS_VERSION,
      effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT,
      sections: [
        { title: "1. Dispoziții generale", paragraphs: ["Acești termeni reglementează utilizarea site-ului public nsd.md, plasarea unei comenzi cu amănuntul și relația clientului cu Novotech.", "Prin plasarea comenzii, clientul confirmă corectitudinea datelor de contact și de adresă furnizate."] },
        { title: "2. Vânzătorul și contactele", paragraphs: ["Marca publică a vânzătorului este Novotech. Datele de contact și adresele magazinelor sunt publicate pe pagina „Contacte”."] },
        { title: "3. Produse și servicii", paragraphs: ["Catalogul include echipamente, materiale și servicii conexe pentru sisteme de securitate. Componența, prețul și disponibilitatea actuale sunt afișate înainte de plasarea comenzii.", "Parametrii instalării și condițiile finale ale lucrărilor se coordonează potrivit obiectivului; site-ul nu promite termene sau costuri neconfirmate."] },
        { title: "4. Plasarea comenzii", paragraphs: ["Clientul selectează produsele, verifică coșul și furnizează datele de contact și de adresă necesare. Comanda este creată dintr-un instantaneu comercial actual și primește un număr unic.", "Dacă prețul, disponibilitatea sau componența s-au schimbat, comanda nu este creată folosind date învechite."] },
        { title: "5. Metode și condiții de plată", paragraphs: ["Metodele disponibile sunt afișate în interfața comenzii. Plata online cu cardul devine disponibilă numai după activarea funcției corespunzătoare de către Novotech.", "Suma plății online este calculată pe server din componența confirmată a comenzii și nu este preluată din browser."] },
        { title: "6. Plata online prin MAIB", paragraphs: ["La plata cu cardul, clientul este redirecționat către pagina securizată MAIB. Novotech nu primește și nu stochează numărul cardului, CVV/CVC sau datele de autorizare ale cardului.", "Revenirea browserului pe nsd.md nu confirmă plata. Starea se modifică numai după confirmarea verificată a prestatorului de plată."] },
        { title: "7. Date cu caracter personal", paragraphs: ["Datele sunt prelucrate pentru plasarea și executarea comenzii, comunicare, livrare, instalare, service și confirmarea plății. Detaliile sunt în Politica de confidențialitate."] },
        { title: "8. Livrare și ridicare", paragraphs: ["Sunt disponibile ridicarea din magazinele Novotech și livrarea coordonată în Moldova. Condițiile concrete sunt confirmate la procesarea comenzii și descrise pe pagina „Livrare”."] },
        { title: "9. Anulare și retur", paragraphs: ["Solicitarea de anulare sau retur se transmite Novotech prin contactele publice. Eligibilitatea, starea produsului și pașii următori sunt verificate înaintea returnării produsului sau banilor.", "Procedura este publicată pe pagina „Retur”; site-ul nu stabilește termene sau excluderi neconfirmate."] },
        { title: "10. Garanție", paragraphs: ["Solicitările de garanție sunt examinate pe baza documentelor de cumpărare și a condițiilor aplicabile produsului sau serviciului concret. Clientul poate contacta service-ul Novotech."] },
        { title: "11. Obligațiile clientului", paragraphs: ["Clientul verifică componența comenzii, furnizează date corecte, respectă instrucțiunile de utilizare și anunță erorile înainte de confirmarea comenzii sau executarea lucrărilor."] },
        { title: "12. Obligațiile vânzătorului", paragraphs: ["Novotech furnizează informațiile disponibile în mod corect, păstrează instantaneul comercial al comenzii și nu recunoaște plata fără confirmarea autoritară a sistemului de plată."] },
        { title: "13. Contact", paragraphs: ["Telefon: 0 79 31 33 53. Email: info@nsd.md. Adresele magazinelor și programul sunt disponibile pe pagina „Contacte”."] },
      ],
    },
  },
  privacy: {
    ru: {
      eyebrow: "ЗАЩИТА ДАННЫХ",
      title: "Политика конфиденциальности",
      summary: "Какие данные использует Novotech и для каких фактических процессов публичного магазина и личного кабинета.",
      version: PUBLIC_PRIVACY_VERSION,
      effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT,
      sections: [
        { title: "Какие данные обрабатываются", paragraphs: ["Контактные и идентификационные данные, данные заказа и адреса, обращения по монтажу и сервису, а также технические данные, необходимые для безопасности и работы сайта."] },
        { title: "Цели обработки", paragraphs: ["Данные используются для оформления и исполнения заказа, связи, доставки, монтажа, поддержки, работы личного кабинета и выполнения обязательств по платежу."] },
        { title: "Телефонная аутентификация", paragraphs: ["Для входа в кабинет конечного клиента может использоваться одноразовый код по телефону. Код предназначен только для подтверждения входа и не должен передаваться третьим лицам."] },
        { title: "Платёжные данные", paragraphs: ["Оплата картой выполняется на защищённой стороне MAIB. Novotech не получает и не хранит номер карты, CVV/CVC или данные авторизации карты; в платформе хранится только необходимое состояние заказа и подтверждения платежа."] },
        { title: "Монтаж, сервис и сообщения", paragraphs: ["Данные запроса передаются только участникам, которым они нужны для исполнения выбранной услуги. Сервисные и транзакционные сообщения направляются по фактическим контактам заказа или аккаунта."] },
        { title: "Технические данные", paragraphs: ["Сайт использует необходимые cookie и технические идентификаторы для языка, корзины, защищённого доступа, стабильности и предотвращения злоупотреблений. Они не превращаются в отдельные коммерческие обещания."] },
        { title: "Сроки хранения и права", paragraphs: ["Данные сохраняются в объёме и на срок, необходимые для заказа, сервиса, безопасности, аудита и применимых обязательств. Запрос о доступе, уточнении или иных применимых правах можно направить на info@nsd.md."] },
      ],
    },
    ro: {
      eyebrow: "PROTECȚIA DATELOR",
      title: "Politica de confidențialitate",
      summary: "Datele folosite de Novotech și procesele reale ale magazinului public și cabinetului personal pentru care sunt necesare.",
      version: PUBLIC_PRIVACY_VERSION,
      effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT,
      sections: [
        { title: "Date prelucrate", paragraphs: ["Date de contact și identificare, datele comenzii și adresei, solicitările de instalare și service, precum și datele tehnice necesare securității și funcționării site-ului."] },
        { title: "Scopurile prelucrării", paragraphs: ["Datele sunt folosite pentru plasarea și executarea comenzii, comunicare, livrare, instalare, suport, cabinetul personal și obligațiile aferente plății."] },
        { title: "Autentificare prin telefon", paragraphs: ["Pentru accesul în cabinetul clientului final poate fi utilizat un cod unic transmis prin telefon. Codul este numai pentru confirmarea accesului și nu trebuie comunicat terților."] },
        { title: "Date de plată", paragraphs: ["Plata cu cardul este efectuată în mediul securizat MAIB. Novotech nu primește și nu stochează numărul cardului, CVV/CVC sau datele de autorizare; platforma păstrează numai starea necesară a comenzii și confirmării plății."] },
        { title: "Instalare, service și comunicări", paragraphs: ["Datele solicitării sunt transmise numai participanților care au nevoie de ele pentru serviciul ales. Mesajele de serviciu și tranzacționale sunt trimise la contactele comenzii sau contului."] },
        { title: "Date tehnice", paragraphs: ["Site-ul utilizează cookie-uri necesare și identificatori tehnici pentru limbă, coș, acces protejat, stabilitate și prevenirea abuzurilor."] },
        { title: "Păstrare și drepturi", paragraphs: ["Datele sunt păstrate în volumul și pe durata necesare comenzii, service-ului, securității, auditului și obligațiilor aplicabile. Solicitările privind accesul, rectificarea sau alte drepturi aplicabile pot fi trimise la info@nsd.md."] },
      ],
    },
  },
  delivery: {
    ru: { eyebrow: "ПОЛУЧЕНИЕ ЗАКАЗА", title: "Доставка и самовывоз", summary: "Фактические способы получения заказа Novotech без неподтверждённых сроков и тарифов.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "Самовывоз", paragraphs: ["Заказ можно получить в согласованном магазине Novotech. Готовность и конкретное место получения подтверждаются до визита."] },
      { title: "Согласованная доставка", paragraphs: ["Novotech организует согласованную доставку по Молдове. Адрес, доступность, стоимость и сроки подтверждаются при обработке конкретного заказа."] },
      { title: "Монтаж", paragraphs: ["Если заказ включает монтаж, адрес и состав работ фиксируются отдельно. Дата и условия выполнения подтверждаются после проверки объекта и доступности монтажной команды."] },
      { title: "Связь", paragraphs: ["Для уточнения получения используйте номер 0 79 31 33 53 или email info@nsd.md."] },
    ] },
    ro: { eyebrow: "PRIMIREA COMENZII", title: "Livrare și ridicare", summary: "Modalitățile reale de primire a comenzii Novotech, fără termene sau tarife neconfirmate.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "Ridicare", paragraphs: ["Comanda poate fi ridicată din magazinul Novotech coordonat. Disponibilitatea și locul concret sunt confirmate înainte de vizită."] },
      { title: "Livrare coordonată", paragraphs: ["Novotech organizează livrare coordonată în Moldova. Adresa, disponibilitatea, costul și termenul sunt confirmate la procesarea comenzii concrete."] },
      { title: "Instalare", paragraphs: ["Dacă o comandă include instalare, adresa și lucrările sunt înregistrate separat. Data și condițiile se confirmă după verificarea obiectivului și a echipei disponibile."] },
      { title: "Contact", paragraphs: ["Pentru detalii despre primire folosiți 0 79 31 33 53 sau info@nsd.md."] },
    ] },
  },
  returns: {
    ru: { eyebrow: "ПОСЛЕ ПОКУПКИ", title: "Возврат и отмена", summary: "Как направить запрос и какие данные нужны Novotech для проверки конкретной покупки.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "Как обратиться", paragraphs: ["До отправки товара свяжитесь с Novotech по телефону 0 79 31 33 53 или email info@nsd.md. Укажите номер заказа, товар и причину обращения."] },
      { title: "Проверка запроса", paragraphs: ["Novotech проверяет документы покупки, состояние и комплектность товара, категорию продукта и применимые требования. Не отправляйте товар без согласования места и способа передачи."] },
      { title: "Отмена заказа", paragraphs: ["Если заказ ещё не исполнен, возможность отмены проверяется по его текущему состоянию. Уже подтверждённая оплата не отменяется только возвратом браузера или сообщением в интерфейсе."] },
      { title: "Возврат денежных средств", paragraphs: ["Способ и срок возврата денежных средств сообщаются после проверки и в соответствии с фактическим способом оплаты и применимыми требованиями."] },
    ] },
    ro: { eyebrow: "DUPĂ CUMPĂRARE", title: "Retur și anulare", summary: "Cum se transmite o solicitare și ce date sunt necesare pentru verificarea cumpărăturii.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "Cum ne contactați", paragraphs: ["Înainte de expedierea produsului, contactați Novotech la 0 79 31 33 53 sau info@nsd.md. Indicați numărul comenzii, produsul și motivul solicitării."] },
      { title: "Verificarea solicitării", paragraphs: ["Novotech verifică documentele cumpărării, starea și completitudinea produsului, categoria și cerințele aplicabile. Nu expediați produsul fără coordonarea locului și modului de predare."] },
      { title: "Anularea comenzii", paragraphs: ["Dacă o comandă nu a fost executată, posibilitatea anulării este verificată după starea ei curentă. O plată confirmată nu este anulată prin simpla revenire a browserului sau printr-un mesaj din interfață."] },
      { title: "Rambursarea banilor", paragraphs: ["Metoda și termenul rambursării sunt comunicate după verificare, potrivit metodei reale de plată și cerințelor aplicabile."] },
    ] },
  },
};
