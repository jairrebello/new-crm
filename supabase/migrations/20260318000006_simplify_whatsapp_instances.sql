-- Migration: Simplify WhatsApp instances (name + instance_token)

-- 1) Add instance_token (single token used for identification/auth)
alter table public.whatsapp_instances
  add column if not exists instance_token text;

-- 2) Backfill instance_token from existing fields
update public.whatsapp_instances
set instance_token = coalesce(instance_token, webhook_secret, provider_instance_key)
where instance_token is null;

-- 3) Ensure instance_token is not null going forward
alter table public.whatsapp_instances
  alter column instance_token set not null;

-- 4) Add unique constraint per tenant for instance_token
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_instances_tenant_token_unique'
  ) then
    alter table public.whatsapp_instances
      add constraint whatsapp_instances_tenant_token_unique unique (tenant_id, instance_token);
  end if;
end $$;

-- 5) Relax old required secret (kept for backwards compatibility)
alter table public.whatsapp_instances
  alter column webhook_secret drop not null;

