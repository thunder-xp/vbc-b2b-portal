begin;

create or replace function public.add_partner_support_message(p_ticket_id uuid,p_expected_version integer,p_message text)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; message_id uuid; event_id uuid; old_status text;
begin
 if not public.can_access_partner_support_ticket(p_ticket_id,true) then raise exception 'Support access denied.' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_message,''))) not between 2 and 5000 then raise exception 'Invalid message.' using errcode='22023'; end if;
 select * into ticket from public.partner_support_tickets where id=p_ticket_id for update;
 if ticket.version<>p_expected_version then raise exception 'Ticket changed.' using errcode='PT409'; end if;
 old_status:=ticket.status;
 if ticket.status in ('closed','rejected','cancelled') then raise exception 'Ticket is immutable.' using errcode='22023'; end if;
 insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'partner',btrim(p_message)) returning id into message_id;
 insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,message) values(ticket.id,auth.uid(),'partner_message','Партнёр добавил информацию.') returning id into event_id;
 update public.partner_support_tickets set status=case when status='waiting_for_partner' then 'in_progress' else status end,resolution_due_at=case when status='waiting_for_partner' and resolution_paused_at is not null then resolution_due_at+(now()-resolution_paused_at) else resolution_due_at end,resolution_paused_at=null,updated_at=now(),version=version+1 where id=ticket.id returning * into ticket;
 if old_status='waiting_for_partner' then insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,from_status,to_status,reason) values(ticket.id,auth.uid(),old_status,'in_progress','Partner supplied requested information'); end if;
 insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,'support_partner_replied','internal','support-partner-reply-'||message_id) on conflict do nothing;
 return jsonb_build_object('id',ticket.id,'status',ticket.status,'version',ticket.version);
end $$;

create or replace function public.transition_partner_support_ticket(p_ticket_id uuid,p_expected_version integer,p_to_status text,p_partner_reply text default '',p_internal_note text default '',p_assignee uuid default null,p_category text default null,p_effective_priority text default null,p_priority_reason text default null)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; old_status text; old_effective_priority text; event_id uuid; allowed boolean;
begin
 if not public.has_internal_permission('support.manage') then raise exception 'Support management denied.' using errcode='42501'; end if;
 select * into ticket from public.partner_support_tickets where id=p_ticket_id for update; if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
 if ticket.version<>p_expected_version then raise exception 'Ticket changed.' using errcode='PT409'; end if;
 old_status:=ticket.status; old_effective_priority:=ticket.effective_priority;
 if p_assignee is not null and (not public.has_internal_permission('support.assign') or not exists(select 1 from public.user_profiles profile join public.internal_user_role_assignments assignment on assignment.user_id=profile.id and assignment.revoked_at is null join public.role_permissions role_permission on role_permission.role_id=assignment.role_id join public.permissions permission on permission.id=role_permission.permission_id where profile.id=p_assignee and profile.status='active' and permission.code in ('support.view_all','support.view_assigned'))) then raise exception 'Invalid support assignee.' using errcode='42501'; end if;
 allowed:=p_to_status=old_status or case old_status when 'new' then p_to_status in ('acknowledged','in_progress','rejected') when 'acknowledged' then p_to_status in ('in_progress','waiting_for_partner','solution_proposed','rejected') when 'in_progress' then p_to_status in ('waiting_for_partner','solution_proposed','resolved','rejected') when 'waiting_for_partner' then p_to_status in ('in_progress','solution_proposed','cancelled') when 'solution_proposed' then p_to_status in ('in_progress','resolved','closed') when 'resolved' then p_to_status in ('closed','in_progress') else false end;
 if not allowed then raise exception 'Invalid support transition.' using errcode='22023'; end if;
 if p_to_status in ('solution_proposed','rejected') and char_length(btrim(coalesce(p_partner_reply,'')))<5 then raise exception 'Partner-facing resolution reason required.' using errcode='22023'; end if;
 if p_effective_priority is not null and p_effective_priority<>ticket.effective_priority and (not public.has_internal_permission('support.priority.manage') or p_effective_priority not in ('high','medium','low') or char_length(btrim(coalesce(p_priority_reason,'')))<5) then raise exception 'Priority change requires permission and reason.' using errcode='42501'; end if;
 update public.partner_support_tickets set status=p_to_status,assigned_internal_user_id=coalesce(p_assignee,assigned_internal_user_id),category=coalesce(p_category,category),effective_priority=coalesce(p_effective_priority,effective_priority),first_responded_at=case when first_responded_at is null and (p_to_status<>'new' or nullif(btrim(p_partner_reply),'') is not null) then now() else first_responded_at end,resolution_paused_at=case when p_to_status='waiting_for_partner' then coalesce(resolution_paused_at,now()) else null end,resolution_due_at=case when old_status='waiting_for_partner' and p_to_status<>'waiting_for_partner' and resolution_paused_at is not null then resolution_due_at+(now()-resolution_paused_at) else resolution_due_at end,resolved_at=case when p_to_status='resolved' then coalesce(resolved_at,now()) when p_to_status='in_progress' and old_status<>p_to_status then null else resolved_at end,closed_at=case when p_to_status in ('closed','rejected','cancelled') then coalesce(closed_at,now()) else closed_at end,resolution_summary=case when p_to_status in ('solution_proposed','resolved','closed') then coalesce(nullif(btrim(p_partner_reply),''),resolution_summary) else resolution_summary end,updated_at=now(),version=version+1 where id=p_ticket_id returning * into ticket;
 if p_to_status<>old_status then
  insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,from_status,to_status,reason) values(ticket.id,auth.uid(),old_status,p_to_status,nullif(btrim(coalesce(p_priority_reason,'')),''));
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'status_changed',true,nullif(btrim(p_partner_reply),''),jsonb_build_object('status',p_to_status)) returning id into event_id;
 elsif nullif(btrim(p_partner_reply),'') is not null then
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message) values(ticket.id,auth.uid(),'support_reply',true,'Novotech добавил ответ.') returning id into event_id;
 else
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'ticket_updated',false,'Support ticket metadata updated.',jsonb_build_object('category',p_category,'assigneeChanged',p_assignee is not null)) returning id into event_id;
 end if;
 if nullif(btrim(p_partner_reply),'') is not null then insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'partner',btrim(p_partner_reply)); end if;
 if nullif(btrim(p_internal_note),'') is not null then insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'internal',btrim(p_internal_note)); end if;
 if p_effective_priority is not null and p_effective_priority is distinct from old_effective_priority then insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'priority_adjusted',false,'Effective priority adjusted.',jsonb_build_object('reason',p_priority_reason,'priority',p_effective_priority)); end if;
 if p_to_status<>old_status or nullif(btrim(p_partner_reply),'') is not null then insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,case p_to_status when 'acknowledged' then 'support_ticket_accepted' when 'waiting_for_partner' then 'support_information_requested' when 'solution_proposed' then 'support_solution_proposed' when 'resolved' then 'support_ticket_resolved' when 'closed' then 'support_ticket_closed' when 'rejected' then 'support_ticket_rejected' else 'support_ticket_reply' end,'partner','support-transition-'||event_id) on conflict do nothing; end if;
 return jsonb_build_object('id',ticket.id,'status',ticket.status,'version',ticket.version);
end $$;

revoke all on function public.add_partner_support_message(uuid,integer,text),public.transition_partner_support_ticket(uuid,integer,text,text,text,uuid,text,text,text) from public,anon;
grant execute on function public.add_partner_support_message(uuid,integer,text),public.transition_partner_support_ticket(uuid,integer,text,text,text,uuid,text,text,text) to authenticated;

commit;
