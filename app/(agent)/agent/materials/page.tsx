import { AgentPageHeader } from "@/src/modules/agent-cabinet/components/PageHeader";
import { getAgentCabinetLocale } from "@/src/modules/agent-cabinet/locale";
import { cabinetPage, cabinetSurface } from "@/src/modules/cabinet-experience/components";

const sections = {
  ru: [
    ["Что делает Novotech", ["Поставляет оборудование для безопасности, сетей и автоматизации.", "Проектирует и выполняет монтаж решений."]],
    ["Как определить потребность", ["Уточните тип объекта и задачу клиента.", "Получите согласие на передачу контакта.", "Зарегистрируйте заявку по своей ссылке."]],
    ["Что можно обещать", ["Представить Novotech и организовать знакомство.", "Помочь кратко описать потребность клиента."]],
    ["Что нельзя обещать", ["Подписывать договоры или принимать деньги от имени Novotech.", "Менять цены, обещать скидки, сроки поставки или монтажа.", "Представляться сотрудником без отдельного полномочия."]],
  ],
  ro: [
    ["Ce face Novotech", ["Furnizează echipamente pentru securitate, rețele și automatizare.", "Proiectează și execută instalarea soluțiilor."]],
    ["Cum identificați necesitatea", ["Clarificați tipul obiectului și necesitatea clientului.", "Obțineți acordul pentru transmiterea contactului.", "Înregistrați recomandarea prin linkul personal."]],
    ["Ce puteți promite", ["Să prezentați Novotech și să organizați contactul.", "Să ajutați la descrierea succintă a necesității clientului."]],
    ["Ce nu puteți promite", ["Să semnați contracte sau să primiți bani în numele Novotech.", "Să modificați prețuri ori să promiteți reduceri și termene.", "Să vă prezentați drept angajat fără împuternicire separată."]],
  ],
} as const;

export default async function AgentMaterialsPage() {
  const locale = await getAgentCabinetLocale();
  const ro = locale === "ro";
  return <main className={cabinetPage}>
    <AgentPageHeader title={ro ? "Materiale" : "Материалы"} description={ro ? "Ghid succint pentru lucrul corect cu clientul." : "Короткая памятка для корректной работы с клиентом."} />
    <div className="grid gap-3 md:grid-cols-2">
      {sections[locale].map(([title, items]) => <section className={`p-4 ${cabinetSurface}`} key={title}>
        <h2 className="font-semibold">{title}</h2>
        <ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-600">{items.map((item) => <li className="flex gap-2" key={item}><span aria-hidden>—</span><span>{item}</span></li>)}</ul>
      </section>)}
    </div>
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <h2 className="font-semibold">{ro ? "Mesaj pentru WhatsApp" : "Сообщение для WhatsApp"}</h2>
      <p className="mt-2 text-sm leading-5 text-zinc-700">{ro ? "Bună ziua! Colaborez cu Novotech și vă pot organiza o consultație despre echipamente sau instalare. Dacă sunteți de acord, transmit contactul dvs. unui specialist Novotech." : "Здравствуйте! Я сотрудничаю с Novotech и могу организовать консультацию по оборудованию или монтажу. Если вы согласны, передам ваш контакт специалисту Novotech."}</p>
    </section>
  </main>;
}
