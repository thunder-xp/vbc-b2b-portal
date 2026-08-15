create index retail_payment_activations_actor_idx
  on public.retail_payment_activations(actor_user_id)
  where actor_user_id is not null;
