begin;

-- Public reads always join the single active generation (currently 813 rows).
-- Scanning that bounded set is materially cheaper than maintaining trigram
-- entries for every immutable historical generation during publication.
drop index if exists public.public_retail_products_publication_search_idx;

commit;

;
