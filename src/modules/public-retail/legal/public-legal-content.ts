import type { PublicRetailLocale } from "../types";

export const PUBLIC_TERMS_VERSION = "2026-09-18";
export const PUBLIC_PRIVACY_VERSION = "2026-09-18";
export const PUBLIC_LEGAL_EFFECTIVE_AT = "2026-09-18T00:00:00+03:00";

type MerchantLegalProfile = Readonly<{
  legalName: string;
  idno: string;
  vatNumber: string;
  registeredAddress: Readonly<Record<PublicRetailLocale, string>>;
  ownerInputRequired: readonly [];
}>;

export const publicMerchantLegalProfile: MerchantLegalProfile = Object.freeze({
  legalName: "NOVOTECH SYSTEMS S.R.L.",
  idno: "1018600013048",
  vatNumber: "0209950",
  registeredAddress: {
    ru: "MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17",
    ro: "MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17",
  },
  ownerInputRequired: [] as const,
});

export const publicPaymentBranding = Object.freeze({
  maib: true,
  supportedInternationalPaymentSystems: ["visa", "mastercard", "amex"] as const,
  maibLiberApplicable: "NO" as const,
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
        { title: "2. Продавец и контакты", paragraphs: ["Продавец — NOVOTECH SYSTEMS S.R.L., IDNO 1018600013048, TVA 0209950. Юридический адрес: MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17. Публичный бренд — Novotech. Контактные данные и адреса магазинов опубликованы на странице «Контакты»."] },
        { title: "3. Товары и услуги", paragraphs: ["Каталог содержит оборудование, материалы и связанные услуги для систем безопасности. Актуальные состав, цена и доступность показываются до оформления заказа.", "Параметры монтажа и окончательные условия работ согласовываются с учётом объекта; сайт не обещает неподтверждённые сроки или стоимость работ."] },
        { title: "4. Оформление заказа", paragraphs: ["Клиент выбирает товары, проверяет состав корзины и передаёт необходимые контактные и адресные данные. Заказ создаётся по актуальному коммерческому снимку и получает уникальный номер.", "Если цена, доступность или состав изменились, заказ не создаётся по устаревшим данным."] },
        { title: "5. Способы и условия оплаты", paragraphs: ["Доступные способы оплаты показываются в интерфейсе заказа. Онлайн-оплата картой становится доступной только после активации соответствующей функции Novotech.", "Сумма онлайн-платежа формируется на сервере из подтверждённого состава заказа и не принимается из браузера."] },
        { title: "6. Онлайн-оплата через MAIB", paragraphs: ["При выборе оплаты картой клиент переходит на защищённую страницу MAIB. Novotech не получает и не хранит номер карты, CVV/CVC или данные авторизации карты.", "Возврат браузера на nsd.md сам по себе не подтверждает оплату. Статус меняется только после проверенного подтверждения платёжного провайдера."] },
        { title: "7. Персональные данные", paragraphs: ["Данные обрабатываются для оформления и исполнения заказа, связи с клиентом, доставки, монтажа, сервиса и подтверждения оплаты. Подробнее — в Политике конфиденциальности."] },
        { title: "8. Доставка и получение", paragraphs: ["Доступны получение в магазинах Novotech и согласованная доставка в Молдове. Конкретные условия подтверждаются при обработке заказа и описаны на странице «Доставка»."] },
        { title: "9. Отмена, отказ и возврат", paragraphs: ["При дистанционной продаже потребитель вправе отказаться от соответствующего товара в течение 14 календарных дней; для товара срок исчисляется с момента его получения или перехода в физическое владение согласно применимому законодательству Республики Молдова. Заявление направляется Novotech по опубликованным контактам.", "Товар возвращается в установленный законом срок в согласованный пункт или согласованным способом. Применяются предусмотренные законом исключения. Возврат производится без неоправданной задержки и не позднее 14 календарных дней с уведомления об отказе, в той же валюте и тем же способом оплаты, если закон или отдельное правомерное соглашение не допускает иное. Прямые расходы на возврат распределяются по применимому закону и опубликованным условиям."] },
        { title: "10. Несоответствие и гарантия", paragraphs: ["Требования по дефектному или несоответствующему товару и гарантийные обращения являются отдельными законными способами защиты и не смешиваются с отказом от соответствующего товара при дистанционной продаже. Они рассматриваются по документам покупки, применимому законодательству и условиям конкретного товара или услуги через сервис Novotech."] },
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
        { title: "2. Vânzătorul și contactele", paragraphs: ["Vânzătorul este NOVOTECH SYSTEMS S.R.L., IDNO 1018600013048, TVA 0209950. Adresa juridică: MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17. Marca publică este Novotech. Datele de contact și adresele magazinelor sunt publicate pe pagina „Contacte”."] },
        { title: "3. Produse și servicii", paragraphs: ["Catalogul include echipamente, materiale și servicii conexe pentru sisteme de securitate. Componența, prețul și disponibilitatea actuale sunt afișate înainte de plasarea comenzii.", "Parametrii instalării și condițiile finale ale lucrărilor se coordonează potrivit obiectivului; site-ul nu promite termene sau costuri neconfirmate."] },
        { title: "4. Plasarea comenzii", paragraphs: ["Clientul selectează produsele, verifică coșul și furnizează datele de contact și de adresă necesare. Comanda este creată dintr-un instantaneu comercial actual și primește un număr unic.", "Dacă prețul, disponibilitatea sau componența s-au schimbat, comanda nu este creată folosind date învechite."] },
        { title: "5. Metode și condiții de plată", paragraphs: ["Metodele disponibile sunt afișate în interfața comenzii. Plata online cu cardul devine disponibilă numai după activarea funcției corespunzătoare de către Novotech.", "Suma plății online este calculată pe server din componența confirmată a comenzii și nu este preluată din browser."] },
        { title: "6. Plata online prin MAIB", paragraphs: ["La plata cu cardul, clientul este redirecționat către pagina securizată MAIB. Novotech nu primește și nu stochează numărul cardului, CVV/CVC sau datele de autorizare ale cardului.", "Revenirea browserului pe nsd.md nu confirmă plata. Starea se modifică numai după confirmarea verificată a prestatorului de plată."] },
        { title: "7. Date cu caracter personal", paragraphs: ["Datele sunt prelucrate pentru plasarea și executarea comenzii, comunicare, livrare, instalare, service și confirmarea plății. Detaliile sunt în Politica de confidențialitate."] },
        { title: "8. Livrare și ridicare", paragraphs: ["Sunt disponibile ridicarea din magazinele Novotech și livrarea coordonată în Moldova. Condițiile concrete sunt confirmate la procesarea comenzii și descrise pe pagina „Livrare”."] },
        { title: "9. Anulare, retragere și retur", paragraphs: ["În vânzarea la distanță, consumatorul are dreptul să se retragă din contractul pentru un produs conform în termen de 14 zile calendaristice; pentru bunuri, termenul începe de la primirea sau intrarea în posesia fizică a acestora, potrivit legislației aplicabile a Republicii Moldova. Notificarea se transmite Novotech prin contactele publicate.", "Bunul se returnează în termenul legal la punctul sau prin metoda coordonată. Se aplică excepțiile prevăzute de lege. Rambursarea se face fără întârzieri nejustificate și cel târziu în 14 zile calendaristice de la notificarea retragerii, în aceeași monedă și prin aceeași metodă de plată, dacă legea sau un acord legal expres nu permite altfel. Costurile directe de returnare sunt suportate potrivit legii aplicabile și condițiilor publicate."] },
        { title: "10. Neconformitate și garanție", paragraphs: ["Reclamațiile pentru produse defecte sau neconforme și cazurile de garanție sunt remedii legale separate și nu sunt confundate cu retragerea din vânzarea la distanță a unui produs conform. Ele sunt examinate pe baza documentelor de cumpărare, legislației aplicabile și condițiilor produsului sau serviciului concret prin service-ul Novotech."] },
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
    ru: { eyebrow: "ПОСЛЕ ПОКУПКИ", title: "Возврат и отмена", summary: "Отказ от дистанционного договора, возврат денежных средств и отдельный порядок для несоответствия и гарантии.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "A. Отказ от дистанционного договора", paragraphs: ["Потребитель вправе отказаться от соответствующего товара, приобретённого дистанционно, в течение 14 календарных дней. Для товара срок начинается с его получения или перехода в физическое владение согласно применимому законодательству Республики Молдова. Применяются предусмотренные законом исключения."] },
      { title: "B. Порядок возврата и возмещения", paragraphs: ["1. Свяжитесь с Novotech по телефону 0 79 31 33 53 или email info@nsd.md и укажите номер заказа и товар. 2. Novotech идентифицирует заказ и проверяет применимость права по закону и опубликованным условиям. 3. Передайте товар в согласованный пункт Novotech или согласованным способом в установленный законом срок.", "Возврат денежных средств производится без неоправданной задержки и не позднее 14 календарных дней с даты уведомления об отказе, в той же валюте и тем же способом оплаты, если применимый закон или отдельное правомерное соглашение не допускает иное. Прямые расходы на возврат распределяются по применимому закону и опубликованным условиям; неподтверждённые логистические тарифы не устанавливаются."] },
      { title: "C. Дефектный или несоответствующий товар", paragraphs: ["Требования, связанные с дефектом или несоответствием товара, рассматриваются отдельно от добровольного отказа от соответствующего товара. Клиент передаёт сведения о заказе и несоответствии; Novotech применяет предусмотренные законом средства защиты потребителя."] },
      { title: "D. Гарантия и сервис", paragraphs: ["Гарантийные и сервисные случаи рассматриваются по документам покупки, применимому законодательству и условиям конкретного товара или услуги. Обращение направляется в сервис Novotech по публичным контактам."] },
    ] },
    ro: { eyebrow: "DUPĂ CUMPĂRARE", title: "Retur și anulare", summary: "Retragerea din contractul la distanță, rambursarea și procedura separată pentru neconformitate și garanție.", version: PUBLIC_TERMS_VERSION, effectiveAt: PUBLIC_LEGAL_EFFECTIVE_AT, sections: [
      { title: "A. Retragerea din contractul la distanță", paragraphs: ["Consumatorul se poate retrage din contractul la distanță pentru un produs conform în termen de 14 zile calendaristice. Pentru bunuri, termenul începe de la primirea sau intrarea în posesia fizică, potrivit legislației aplicabile a Republicii Moldova. Se aplică excepțiile prevăzute de lege."] },
      { title: "B. Procedura de retur și rambursare", paragraphs: ["1. Contactați Novotech la 0 79 31 33 53 sau info@nsd.md și indicați comanda și produsul. 2. Novotech identifică achiziția și verifică eligibilitatea potrivit legii și condițiilor publicate. 3. Predați produsul la punctul Novotech desemnat sau prin metoda coordonată, în termenul legal.", "Rambursarea se efectuează fără întârzieri nejustificate și cel târziu în 14 zile calendaristice de la notificarea retragerii, în aceeași monedă și prin aceeași metodă de plată, dacă legea aplicabilă sau un acord legal expres nu permite altfel. Costurile directe de returnare sunt suportate potrivit legii și condițiilor publicate; nu sunt stabilite tarife logistice neconfirmate."] },
      { title: "C. Produs defect sau neconform", paragraphs: ["Reclamațiile privind defectele sau neconformitatea se examinează separat de retragerea voluntară pentru un produs conform. Clientul comunică datele comenzii și neconformitatea, iar Novotech aplică remediile prevăzute de lege."] },
      { title: "D. Garanție și service", paragraphs: ["Cazurile de garanție și service sunt examinate potrivit documentelor de cumpărare, legislației aplicabile și condițiilor produsului sau serviciului concret. Solicitarea se transmite service-ului Novotech prin contactele publice."] },
    ] },
  },
};
