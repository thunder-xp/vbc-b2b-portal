"use client";

import { useEffect, useRef, useState } from "react";

export function ExpandableDescription({ text }: { text: string }) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const element = paragraphRef.current;
    if (!element) return;
    const measure = () => setCanExpand(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return <div className="mt-3.5">
    <p className={`whitespace-pre-line text-sm leading-[1.5] text-zinc-700 ${expanded ? "" : "line-clamp-[9]"}`} ref={paragraphRef}>{text}</p>
    {canExpand || expanded ? <button aria-expanded={expanded} className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "Свернуть" : "Подробнее…"}</button> : null}
  </div>;
}
