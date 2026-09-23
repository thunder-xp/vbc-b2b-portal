"use client";

import { Gift, Handshake, Home, Send, Shapes, UserRound, UsersRound } from "lucide-react";

import { CabinetNavigation } from "@/src/modules/cabinet-experience/components";
import { agentCabinetCopy, type AgentCabinetLocale } from "../copy";

export function AgentNavigation({ locale }: { locale: AgentCabinetLocale }) {
  const copy = agentCabinetCopy[locale];
  const items = [
    { href: "/agent", label: copy.home, Icon: Home },
    { href: "/agent/referrals", label: copy.referrals, Icon: Send, activePrefixes: ["/agent/referrals/"] },
    { href: "/agent/clients", label: copy.clients, Icon: UsersRound, activePrefixes: ["/agent/clients/"] },
    { href: "/agent/deals", label: copy.deals, Icon: Handshake, activePrefixes: ["/agent/deals/"] },
    { href: "/agent/rewards", label: copy.rewards, Icon: Gift, activePrefixes: ["/agent/rewards/"] },
    { href: "/agent/qr", label: copy.tools, Icon: Shapes, activePrefixes: ["/agent/qr/", "/agent/materials"] },
    { href: "/agent/profile", label: copy.profile, Icon: UserRound, activePrefixes: ["/agent/profile/"] },
  ] as const;
  return <CabinetNavigation ariaLabel={copy.cabinet} items={items} maxWidthClass="max-w-6xl md:flex-wrap" />;
}
