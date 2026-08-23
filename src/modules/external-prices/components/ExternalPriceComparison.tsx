import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { formatPartnerDate, getExternalPricesCopy, partnerLocaleTag, type PartnerLocale } from "../../partner-locale";
import type { CurrentExternalPriceDto } from "../types";

export function ExternalPriceComparison({ commercialView, locale, prices }: { commercialView?: ProductCommercialViewDto; locale: PartnerLocale; prices: CurrentExternalPriceDto[] }) {
  if (!prices.length) return null;
  const copy=getExternalPricesCopy(locale);
  return <section aria-labelledby="external-price-heading" className="mt-3 border-t border-zinc-200 pt-3"><h2 className="text-sm font-semibold" id="external-price-heading">{copy.competitorPrices}</h2><div className="mt-2 space-y-2">{groupPrices(prices).map(group=><article className="border border-zinc-200 bg-zinc-50 p-3" key={group.sourceId}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-zinc-950">{group.sourceName}</h3><p className="text-xs text-zinc-500">{copy.priceFrom} {formatPartnerDate(group.observedAt,locale,{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"})}</p></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{group.prices.map(price=><ComparisonRow commercialView={commercialView} copy={copy} key={price.priceType} locale={locale} price={price}/>)}</div></article>)}</div></section>;
}

function ComparisonRow({commercialView,copy,locale,price}:{commercialView?:ProductCommercialViewDto;copy:ReturnType<typeof getExternalPricesCopy>;locale:PartnerLocale;price:CurrentExternalPriceDto}){
  const own=price.priceType==="partner"?commercialView?.partnerPrice:commercialView?.retailPrice;
  const equivalent=own&&own.currencyCode===price.currency?own:null;
  const delta=equivalent?equivalent.amount-price.amount:null;
  const percent=delta!==null&&price.amount>0?Math.abs(delta)/price.amount*100:null;
  const direction=delta===null?null:Math.abs(delta)/price.amount<0.01?"parity":delta<0?"novotech":"source";
  return <div><p className="text-xs font-medium text-zinc-500">{price.priceType==="partner"?copy.partnerPrice:copy.retailPrice}</p><p className="mt-0.5 text-base font-semibold">{money(price.amount,price.currency,locale)}</p>{own?<p className="mt-0.5 text-xs text-zinc-600">{copy.yourPrice}: {money(own.amount,own.currencyCode??"",locale)}</p>:null}{direction?<p className={`mt-1 text-xs font-semibold ${direction==="novotech"?"text-emerald-700":direction==="source"?"text-amber-800":"text-zinc-600"}`}>{direction==="parity"?copy.comparable:direction==="novotech"?`${copy.novotechCheaper} ${money(Math.abs(delta!),price.currency,locale)} / ${percent!.toFixed(1)}%`:`${price.sourceName} ${copy.sourceCheaper} ${money(Math.abs(delta!),price.currency,locale)} / ${percent!.toFixed(1)}%`}</p>:null}</div>;
}
function groupPrices(prices:CurrentExternalPriceDto[]){const map=new Map<string,{sourceId:string;sourceName:string;observedAt:string;prices:CurrentExternalPriceDto[]}>();for(const price of prices){const item=map.get(price.sourceId)??{sourceId:price.sourceId,sourceName:price.sourceName,observedAt:price.observedAt,prices:[]};item.prices.push(price);if(price.observedAt>item.observedAt)item.observedAt=price.observedAt;map.set(price.sourceId,item);}return[...map.values()];}
function money(value:number,currency:string,locale:PartnerLocale){return `${new Intl.NumberFormat(partnerLocaleTag(locale),{minimumFractionDigits:2,maximumFractionDigits:4}).format(value)} ${currency}`.trim();}
