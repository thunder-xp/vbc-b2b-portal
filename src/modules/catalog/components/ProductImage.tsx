"use client";
import Image from "next/image";
import { useState } from "react";
export function ProductImage({ alt, src, sizes = "(max-width: 768px) 100vw, 320px" }: { alt: string; src: string | null; sizes?: string }) { const [failed, setFailed] = useState(false); return <Image alt={alt} className="object-contain p-4" fill loading="lazy" onError={() => setFailed(true)} sizes={sizes} src={!failed && src ? src : "/product-placeholder.svg"} />; }
