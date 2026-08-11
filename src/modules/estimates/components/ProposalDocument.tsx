import Image from "next/image";

import { ProductLineThumbnail } from "../../catalog/components/ProductLineThumbnail";
import { conciseProposalDescription, proposalVatLabels, sectionSubtotalLabel } from "../services/proposal-presentation";
import type { CustomerProposalDto } from "../types";

export function ProposalDocument({ proposal }: { proposal: CustomerProposalDto }) {
  const settings = proposal.settings;
  const showCodeColumn = proposal.schemaVersion !== "2026-08-11-v3";
  return <article aria-label={`Коммерческое предложение ${proposal.estimateNumber}`} className="mx-auto min-h-[297mm] w-full max-w-[210mm] overflow-hidden bg-white px-4 py-6 text-zinc-800 shadow-sm sm:px-8 sm:py-8" role="document">
    <header className="flex flex-col justify-between gap-4 border-b-2 border-emerald-700 pb-4 sm:flex-row">
      <div className="flex gap-3">{settings.showPartnerLogo && proposal.branding.logoUrl && <Image alt="" className="size-14 object-contain" height={56} referrerPolicy="no-referrer" src={proposal.branding.logoUrl} unoptimized width={56} />}<div><p className="text-xl font-bold text-emerald-800">{proposal.branding.companyName}</p>{proposal.branding.legalName && <p className="mt-1 text-xs text-zinc-500">{proposal.branding.legalName}</p>}<BrandingLines proposal={proposal} /></div></div>
      <div className="sm:text-right"><h1 className="text-xl font-semibold text-zinc-950">{settings.title}</h1><p className="mt-2 font-mono text-sm font-semibold">{proposal.estimateNumber}</p><dl className="mt-2 space-y-1 text-xs text-zinc-500"><Meta label="Дата" value={formatDate(proposal.generatedForDate)} />{proposal.validUntilDate && <Meta label="Действительно до" value={formatDate(proposal.validUntilDate)} />}</dl></div>
    </header>
    <section className="grid gap-4 border-b border-zinc-200 py-4 sm:grid-cols-2"><div><Label>Получатель</Label><p className="mt-1 font-semibold text-zinc-950">{proposal.customerName || "Не указан"}</p>{proposal.projectName && <p className="mt-1 text-sm text-zinc-600">{proposal.projectName}</p>}</div>{settings.introduction && <p className="text-sm leading-5 text-zinc-600">{settings.introduction}</p>}</section>
    <div className="space-y-5 py-4">{proposal.sections.map((section) => {
      const showImage = settings.showProductImages && section.lines.some((line) => isProductProposalLine(line) && Boolean(line.imageUrl));
      return <section className="break-inside-auto" key={section.name}>
        <h2 className="mb-2 break-after-avoid text-sm font-semibold text-emerald-800">{section.name}</h2>
        <div className="overflow-hidden"><table className="block w-full border-collapse text-xs sm:table sm:table-fixed print:table">
          <thead className="hidden bg-emerald-50 text-left text-zinc-700 sm:table-header-group print:table-header-group"><tr><th className="w-8 px-2 py-1.5">№</th>{showImage && <th className="w-12 px-1 py-1.5"><span className="sr-only">Изображение</span></th>}{showCodeColumn && <th className="w-24 px-2 py-1.5">Код / модель</th>}<th className="px-2 py-1.5">Описание</th><th className="w-12 px-2 py-1.5">Ед.</th><th className="w-16 px-2 py-1.5 text-right">Кол-во</th>{settings.showUnitPrice && <th className="w-24 px-2 py-1.5 text-right">Цена за ед.</th>}{settings.showLineDiscount && <th className="w-16 px-2 py-1.5 text-right">Скидка</th>}<th className="w-24 px-2 py-1.5 text-right">Сумма</th></tr></thead>
          <tbody className="block sm:table-row-group print:table-row-group">{section.lines.map((line) => <tr className="grid grid-cols-2 gap-x-3 border-b border-zinc-200 py-2 align-top sm:table-row sm:py-0 print:table-row" key={`${section.name}-${line.position}`}>
            <td className="hidden px-2 py-2 text-zinc-500 sm:table-cell print:table-cell">{line.position}</td>
            {showImage && <td className="hidden px-1 py-1 sm:table-cell print:table-cell">{isProductProposalLine(line) ? <ProductLineThumbnail imageUrl={line.imageUrl} productName={line.description} size="compact" /> : null}</td>}
            {showCodeColumn && <td className="col-span-2 break-words px-2 py-1 font-mono text-[10px] text-zinc-600 sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Код / модель</MobileLabel>{line.sku || "—"}</td>}
            <td className="col-span-2 break-words px-2 py-1 sm:table-cell sm:py-2 print:table-cell">{!showCodeColumn && line.sku && <p className="mb-0.5 font-mono text-[10px] text-zinc-600">{line.sku}</p>}<p aria-label={line.description} className="font-medium leading-4 text-zinc-950" title={line.description}>{conciseProposalDescription(line.description)}</p></td>
            <td className="px-2 py-1 sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Единица</MobileLabel>{line.unitLabel}</td>
            <td className="px-2 py-1 text-right sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Количество</MobileLabel>{formatNumber(line.quantity)}</td>
            {settings.showUnitPrice && <td className="px-2 py-1 text-right sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Цена за единицу</MobileLabel>{money(line.unitPrice, proposal.currencyCode)}</td>}
            {settings.showLineDiscount && <td className="px-2 py-1 text-right sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Скидка</MobileLabel>{line.lineDiscountPercent ? `${formatNumber(line.lineDiscountPercent)}%` : "—"}</td>}
            <td className="px-2 py-1 text-right font-semibold sm:table-cell sm:py-2 print:table-cell"><MobileLabel>Сумма</MobileLabel>{money(line.lineTotal, proposal.currencyCode)}</td>
          </tr>)}</tbody>
        </table></div>
        {settings.showSectionSubtotals && section.lines.length > 0 && <p className="mt-2 break-before-avoid text-right text-sm font-semibold">{sectionSubtotalLabel(section.name)}: {money(section.subtotal, proposal.currencyCode)}</p>}
      </section>;
    })}</div>
    {proposal.charges.length > 0 && <section className="border-t border-zinc-200 py-5"><h2 className="font-semibold text-emerald-800">Дополнительные работы и услуги</h2>{proposal.charges.map((charge) => <div className="mt-2 flex justify-between gap-4 text-sm" key={charge.description}><span>{charge.description}</span><strong>{money(charge.amount, proposal.currencyCode)}</strong></div>)}</section>}
    <ProposalTotals proposal={proposal} />
  </article>;
}

function BrandingLines({ proposal }: { proposal: CustomerProposalDto }) { const values = [proposal.branding.contactName ? `Ответственный: ${proposal.branding.contactName}` : null, proposal.branding.phone, proposal.branding.email, proposal.branding.address, proposal.branding.fiscalInformation, proposal.branding.website].filter(Boolean); return <div className="mt-2 space-y-0.5 text-xs text-zinc-500">{values.map((value) => <p key={value}>{value}</p>)}</div>; }
function ProposalTotals({ proposal }: { proposal: CustomerProposalDto }) {
  const labels = proposalVatLabels(proposal);
  return <section className="ml-auto w-full max-w-sm break-inside-avoid border-y-2 border-emerald-700 bg-emerald-50 px-4 py-3" aria-label="Итоги предложения">
    {proposal.totals.discounts > 0 && <Total label="Скидки" value={`− ${money(proposal.totals.discounts, proposal.currencyCode)}`} />}
    {proposal.totals.charges > 0 && <Total label="Дополнительные услуги" value={money(proposal.totals.charges, proposal.currencyCode)} />}
    <Total label={labels.excludingVat} value={money(proposal.totals.totalExcludingVat, proposal.currencyCode)} />
    {proposal.settings.showVatBreakdown && labels.vat && <Total label={labels.vat} value={money(proposal.totals.vat, proposal.currencyCode)} />}
    <div className="mt-2 flex justify-between gap-4 border-t border-emerald-700 pt-2 text-xl font-bold text-emerald-900"><span>К оплате</span><span>{money(proposal.totals.total, proposal.currencyCode)}</span></div>
  </section>;
}
function Total({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-zinc-600">{label}</span><span className="font-semibold">{value}</span></div>; }
function MobileLabel({ children }: { children: React.ReactNode }) { return <span className="mb-0.5 block text-[10px] font-medium uppercase text-zinc-400 sm:hidden print:hidden">{children}</span>; }
function Label({ children }: { children: React.ReactNode }) { return <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{children}</p>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 sm:justify-end"><dt>{label}</dt><dd className="font-medium text-zinc-700">{value}</dd></div>; }
function isProductProposalLine(line: CustomerProposalDto["sections"][number]["lines"][number]) { return line.lineType === "product" || (!line.lineType && Boolean(line.sku || line.imageUrl)); }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 2 }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
