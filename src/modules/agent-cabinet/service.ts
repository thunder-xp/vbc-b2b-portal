import "server-only";

import { createHash, randomBytes } from "node:crypto";

import QRCode from "qrcode";

import { AgentCabinetRepository } from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AgentCabinetService {
  constructor(private readonly repository = new AgentCabinetRepository()) {}
  context() { return this.repository.context(); }
  overview() { return this.repository.overview(); }
  referrals(page: number) { return this.repository.referrals(validPage(page)); }
  clients(page: number) { return this.repository.clients(validPage(page)); }
  referral(id: string) { return UUID.test(id) ? this.repository.referral(id) : Promise.resolve(null); }
  client(id: string) { return UUID.test(id) ? this.repository.client(id) : Promise.resolve(null); }
  updateProfile(input: { phone: string; email: string; locality: string; profession: string; workplace: string }) {
    const bounded = (value: string, max: number) => value.trim().slice(0, max);
    return this.repository.updateProfile({
      phone: bounded(input.phone, 32), email: bounded(input.email, 254).toLowerCase(),
      locality: bounded(input.locality, 120), profession: bounded(input.profession, 160),
      workplace: bounded(input.workplace, 200),
    });
  }
  async primaryQr(origin: string) {
    const raw = randomBytes(32).toString("base64url");
    const token = await this.repository.ensurePrimaryToken(raw, createHash("sha256").update(raw).digest("hex"));
    const url = `${origin.replace(/\/$/, "")}/a/${token.publicToken}`;
    return { ...token, url, svg: await QRCode.toString(url, { type: "svg", margin: 2, width: 512, color: { dark: "#18181b", light: "#ffffff" } }) };
  }
}

function validPage(value: number) { return Number.isInteger(value) && value > 0 ? value : 1; }

export function createAgentCabinetService() { return new AgentCabinetService(); }
