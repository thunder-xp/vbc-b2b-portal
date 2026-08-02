import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const sql=readFileSync("supabase/migrations/20260802210000_service_operations_completion.sql","utf8");
describe("service operational completion",()=>{
  it("projects the governed partner notification catalog idempotently",()=>{for(const code of ["service_case_created","service_information_requested","service_diagnosis_completed","service_ready_for_pickup","service_case_closed"])expect(sql).toContain(code);expect(sql).toContain("on conflict(recipient_user_id,deduplication_key) do nothing");expect(sql).toContain("membership.status='active'");expect(sql).toContain("profile.status='active'")});
  it("uses Chisinau business hours and a locked bounded SLA worker",()=>{expect(sql).toContain("Europe/Chisinau");expect(sql).toContain("'09:00'::time");expect(sql).toContain("'18:00'::time");expect(sql).toContain("for update skip locked");expect(sql).toContain("least(greatest(p_batch_size,1),500)");expect(sql).toContain("service_case_overdue")});
  it("pauses internal overdue behavior while waiting for the partner",()=>{expect(sql).toContain("stage<>'partner_response'");expect(sql).toContain("status not in ('closed','rejected','cancelled')")});
  it("keeps dashboard projections bounded and free of live 1C",()=>{expect(sql).toContain("create or replace function public.get_partner_service_dashboard");expect(sql).toContain("limit 2");expect(sql).toContain("create or replace function public.get_admin_service_attention");expect(sql).not.toContain("Document_");expect(sql).not.toContain("http")});
  it("governs PDF document linkage and internal visibility",()=>{for(const type of ["service_acceptance_act","diagnostic_report","repair_act","replacement_act","return_act","warranty_decision"])expect(sql).toContain(type);expect(sql).toContain("checksum_sha256=p_checksum");expect(sql).toContain("'internalOnly',not p_partner_visible");expect(sql).toContain("document.safe_metadata->>'internalOnly'")});
  it("version-checks partner actions and preserves append-only events",()=>{expect(sql).toContain("c.version<>p_expected_version");expect(sql).toContain("perform_partner_service_action");expect(sql).toContain("insert into public.service_case_events");expect(sql).toContain("Action unavailable")});
});
