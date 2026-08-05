import { Handshake } from "lucide-react";

export default function AffiliateProgramPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">Программы лояльности</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Аффилированная программа</h1>
      </header>
      <section className="border border-zinc-200 bg-white p-6">
        <Handshake aria-hidden="true" className="size-7 text-emerald-700" />
        <h2 className="mt-4 font-semibold text-zinc-950">Информация о программе</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">Условия участия и доступные возможности будут опубликованы после утверждения программы Novotech. Здесь не отображаются неподтверждённые начисления или ставки.</p>
      </section>
    </main>
  );
}
