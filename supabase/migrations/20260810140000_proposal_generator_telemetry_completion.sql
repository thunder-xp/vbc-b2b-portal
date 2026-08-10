create or replace function public.get_estimate_generator_admin_report(result_limit integer default 20)
returns jsonb language sql security definer set search_path = public stable as $$
  select case when not public.has_internal_permission('admin.estimates.view') then null else jsonb_build_object(
    'summary', jsonb_build_object(
      'usageCount', count(*),
      'generationCompleted', count(*) filter(where status in ('completed','estimate_created')),
      'generationFailed', count(*) filter(where status='failed'),
      'companiesCount', count(distinct company_id),
      'estimatesCreated', count(*) filter(where status='estimate_created'),
      'completionRate', coalesce(round(100.0*count(*) filter(where status in ('completed','estimate_created'))/nullif(count(*),0),1),0),
      'generatorToEstimateConversionRate', coalesce(round(100.0*count(*) filter(where status='estimate_created')/nullif(count(*) filter(where status in ('completed','estimate_created')),0),1),0),
      'averageGenerationDurationMs', coalesce(round(avg(generation_duration_ms) filter(where status in ('completed','estimate_created'))),0),
      'averageGenerationToEstimateMs', coalesce(round(avg(extract(epoch from (estimate_created_at-created_at))*1000) filter(where status='estimate_created')),0),
      'averageGeneratedLines', coalesce(round(avg(requirement_count) filter(where status in ('completed','estimate_created')),1),0),
      'resolvedCatalogCount', coalesce(sum(resolved_catalog_count),0),
      'ownNomenclatureCount', coalesce(sum(own_nomenclature_count),0),
      'sharedNomenclatureCount', coalesce(sum(shared_nomenclature_count),0),
      'unresolvedCount', coalesce(sum(unresolved_count),0),
      'feedbackYes', (select count(*) from public.estimate_generator_feedback where answer='yes'),
      'feedbackPartial', (select count(*) from public.estimate_generator_feedback where answer='partial'),
      'feedbackNo', (select count(*) from public.estimate_generator_feedback where answer='no')
    ),
    'comments', coalesce((select jsonb_agg(row_data order by created_at desc) from (
      select feedback.answer, feedback.comment, feedback.created_at from public.estimate_generator_feedback feedback
      where feedback.comment is not null order by feedback.created_at desc limit greatest(1,least(result_limit,50))
    ) row_data),'[]'::jsonb)
  ) end from public.estimate_generator_sessions;
$$;

revoke all on function public.get_estimate_generator_admin_report(integer) from public, anon;
grant execute on function public.get_estimate_generator_admin_report(integer) to authenticated;
