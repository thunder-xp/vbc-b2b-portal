import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type { AgentCabinetContext, AgentCabinetOverview, AgentClientView, AgentPrimaryToken, AgentReferralView, PageResult } from "./types";

export class AgentCabinetRepository {
  async context(): Promise<AgentCabinetContext | null> { return this.rpc("get_agent_cabinet_context"); }
  async overview(): Promise<AgentCabinetOverview | null> { return this.rpc("get_agent_cabinet_overview"); }
  async openAttention(eventId: string): Promise<string> { return this.rpc("open_agent_cabinet_attention_v1", { p_event_id: eventId }); }
  async referrals(page: number): Promise<PageResult<AgentReferralView>> {
    return this.rpc("list_agent_cabinet_referrals", { p_limit: 20, p_offset: (page - 1) * 20 });
  }
  async referral(id: string): Promise<AgentReferralView | null> {
    return this.rpc("get_agent_cabinet_referral", { p_referral_id: id });
  }
  async clients(page: number): Promise<PageResult<AgentClientView>> {
    return this.rpc("list_agent_cabinet_clients", { p_limit: 20, p_offset: (page - 1) * 20 });
  }
  async client(id: string): Promise<AgentClientView | null> {
    return this.rpc("get_agent_cabinet_client", { p_attribution_id: id });
  }
  async ensurePrimaryToken(publicToken: string, tokenHash: string): Promise<AgentPrimaryToken> {
    return this.rpc("ensure_agent_cabinet_primary_token", { p_public_token: publicToken, p_token_hash: tokenHash });
  }
  async updateProfile(input: { phone: string; email: string; locality: string; profession: string; workplace: string }): Promise<AgentCabinetContext> {
    return this.rpc("update_agent_cabinet_profile", {
      p_phone: input.phone, p_email: input.email, p_locality: input.locality,
      p_profession: input.profession, p_workplace: input.workplace,
    });
  }

  private async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const client = await createClient();
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`Agent cabinet ${name} failed: ${error.code}`);
    return data as T;
  }
}
