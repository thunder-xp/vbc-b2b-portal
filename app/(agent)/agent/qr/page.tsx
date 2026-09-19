import { createAgentCabinetService, getAgentCabinetLocale } from "@/src/modules/agent-cabinet";
import { AgentPageHeader } from "@/src/modules/agent-cabinet/components/PageHeader";
import { QrShare } from "@/src/modules/agent-cabinet/components/QrShare";
import { cabinetPageNarrow, cabinetSurface } from "@/src/modules/cabinet-experience/components";

export default async function AgentQrPage() {
  const service = createAgentCabinetService();
  const [context, token, locale] = await Promise.all([
    service.context(),
    service.primaryQr(process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nsd.md"),
    getAgentCabinetLocale(),
  ]);
  if (!context) return null;
  const ro = locale === "ro";

  return <main className={cabinetPageNarrow}>
    <AgentPageHeader title={ro ? "QR-ul meu" : "Мой QR"} description={ro ? "Arătați codul clientului sau trimiteți linkul." : "Покажите код клиенту или отправьте ссылку."} />
    <section className={`grid min-w-0 gap-5 p-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:p-5 ${cabinetSurface}`}>
      <div aria-label={ro ? "Cod QR pentru recomandarea personală" : "QR-код персональной рекомендации"} className="mx-auto w-full max-w-[240px] rounded-lg bg-white p-1 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: token.svg }} role="img" />
      <div className="min-w-0 sm:self-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Novotech Partner</p>
        <h2 className="mt-1 text-lg font-semibold">{context.displayName}</h2>
        <p className="font-mono text-xs text-zinc-500">{context.agentCode}</p>
        <p className="mt-3 text-sm leading-5 text-zinc-600">{ro ? "Clientul accesează linkul dvs. Sistemul înregistrează sursa recomandării; cererea rămâne supusă regulilor de verificare." : "Клиент переходит по вашей ссылке. Система фиксирует источник рекомендации; заявка остаётся предметом проверки по действующим правилам."}</p>
        <div className="mt-4"><QrShare fileName={`novotech-${context.agentCode}.svg`} locale={locale} svg={token.svg} url={token.url} /></div>
      </div>
    </section>
  </main>;
}
