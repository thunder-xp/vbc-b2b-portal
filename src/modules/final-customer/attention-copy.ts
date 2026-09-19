import type { CustomerAttentionItem } from "./types";

type Locale = "ru" | "ro";

const COPY: Record<Locale, Record<CustomerAttentionItem["eventCode"], { title: string; detail: string; action: string }>> = {
  ru: {
    CUSTOMER_SERVICE_NEED_INFO: { title: "Нужен ваш ответ", detail: "Novotech ожидает дополнительную информацию", action: "Ответить" },
    CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH: { title: "Получен ответ Novotech", detail: "В обращении появилось новое сообщение", action: "Посмотреть" },
    CUSTOMER_SERVICE_RESOLVED: { title: "Обращение решено", detail: "Novotech завершил работу с обращением", action: "Открыть" },
    CUSTOMER_PAYMENT_PAID: { title: "Оплата подтверждена", detail: "Заказ успешно оплачен", action: "Открыть заказ" },
    CUSTOMER_PAYMENT_FAILED: { title: "Оплата не выполнена", detail: "Платёж не завершён — заказ можно открыть и проверить", action: "Открыть заказ" },
    CUSTOMER_PAYMENT_REFUNDED: { title: "Возврат подтверждён", detail: "Возврат по заказу завершён", action: "Открыть заказ" },
  },
  ro: {
    CUSTOMER_SERVICE_NEED_INFO: { title: "Este necesar răspunsul dvs.", detail: "Novotech așteaptă informații suplimentare", action: "Răspundeți" },
    CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH: { title: "Răspuns nou de la Novotech", detail: "În solicitare a apărut un mesaj nou", action: "Vedeți" },
    CUSTOMER_SERVICE_RESOLVED: { title: "Solicitare soluționată", detail: "Novotech a finalizat solicitarea", action: "Deschideți" },
    CUSTOMER_PAYMENT_PAID: { title: "Plată confirmată", detail: "Comanda a fost achitată cu succes", action: "Deschideți comanda" },
    CUSTOMER_PAYMENT_FAILED: { title: "Plata nu a fost efectuată", detail: "Plata nu s-a finalizat — puteți deschide și verifica comanda", action: "Deschideți comanda" },
    CUSTOMER_PAYMENT_REFUNDED: { title: "Rambursare confirmată", detail: "Rambursarea comenzii a fost finalizată", action: "Deschideți comanda" },
  },
};

export function customerAttentionCopy(item: CustomerAttentionItem, locale: Locale) {
  const copy = COPY[locale][item.eventCode];
  return { ...copy, detail: `${copy.detail} · ${item.contextLabel}` };
}
