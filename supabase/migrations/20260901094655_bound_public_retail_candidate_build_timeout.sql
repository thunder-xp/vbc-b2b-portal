-- Public Retail candidate builds normally complete in 2-8 seconds. The REST
-- service role otherwise inherits authenticator's 8-second timeout, making the
-- atomic build fail at the healthy upper edge. Keep the exemption function-local
-- and bounded so unrelated API work retains the platform default.
alter function public.build_public_retail_candidate(uuid)
  set statement_timeout = '15s';
