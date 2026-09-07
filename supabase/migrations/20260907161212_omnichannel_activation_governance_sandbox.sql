-- Enum evolution is isolated so SANDBOX can be used by the following migration.
alter type public.communication_channel_mode add value if not exists 'SANDBOX' after 'DRY_RUN';
