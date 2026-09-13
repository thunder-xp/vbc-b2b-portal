import { AgentPageHeader } from "@/src/modules/agent-cabinet/components/PageHeader";

const sections=[
  ["Что делает Novotech",["Поставляет оборудование для безопасности, сетей и автоматизации.","Проектирует и выполняет монтаж решений."]],
  ["Как определить потребность",["Уточните тип объекта и задачу клиента.","Получите согласие на передачу контакта.","Зарегистрируйте заявку по своей ссылке."]],
  ["Что можно обещать",["Представить Novotech и организовать знакомство.","Помочь кратко описать потребность клиента."]],
  ["Что нельзя обещать",["Подписывать договоры или принимать деньги от имени Novotech.","Менять цены, обещать скидки, сроки поставки или монтажа.","Представляться сотрудником без отдельного полномочия."]],
] as const;
export default function AgentMaterialsPage(){return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><AgentPageHeader title="Материалы" description="Короткая памятка для корректной работы с клиентом."/><div className="grid gap-4 md:grid-cols-2">{sections.map(([title,items])=><section className="border border-zinc-200 bg-white p-5" key={title}><h2 className="font-semibold">{title}</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">{items.map(item=><li className="flex gap-2" key={item}><span aria-hidden>—</span><span>{item}</span></li>)}</ul></section>)}</div><section className="border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-semibold">Сообщение для WhatsApp</h2><p className="mt-2 text-sm leading-6">Здравствуйте! Я сотрудничаю с Novotech и могу организовать консультацию по оборудованию или монтажу. Если вы согласны, передам ваш контакт специалисту Novotech.</p></section></main>}
