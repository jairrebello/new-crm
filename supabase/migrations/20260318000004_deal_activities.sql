-- Migration: Deal Activities

-- ACTIVITIES table
-- activity_type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'stage_change'
create table public.activities (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  deal_id uuid references public.deals(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete set null,
  activity_type text not null,
  title text,
  body text,
  due_date timestamptz,
  completed_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now() not null
);

alter table public.activities enable row level security;

create policy "Tenant Isolation: Activities" on public.activities for all
  using (tenant_id in (
    select tenant_id from public.tenant_users where user_id = auth.uid()
  ));

-- Function to auto-log a stage_change activity when a deal's stage changes
create or replace function public.log_deal_stage_change()
returns trigger as $$
declare
  v_tenant_id uuid;
  v_from_stage_name text;
  v_to_stage_name text;
begin
  if OLD.stage_id is distinct from NEW.stage_id then
    -- Get tenant_id
    v_tenant_id := NEW.tenant_id;

    -- Get stage names
    select name into v_from_stage_name from public.pipeline_stages where id = OLD.stage_id;
    select name into v_to_stage_name from public.pipeline_stages where id = NEW.stage_id;

    insert into public.activities (
      tenant_id,
      deal_id,
      user_id,
      activity_type,
      title,
      metadata
    ) values (
      v_tenant_id,
      NEW.id,
      auth.uid(),
      'stage_change',
      'Stage changed',
      jsonb_build_object(
        'from_stage_id', OLD.stage_id,
        'to_stage_id', NEW.stage_id,
        'from_stage_name', v_from_stage_name,
        'to_stage_name', v_to_stage_name
      )
    );

    -- Also insert into deal_stage_history for backwards compatibility
    insert into public.deal_stage_history (tenant_id, deal_id, from_stage_id, to_stage_id, user_id)
    values (v_tenant_id, NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_deal_stage_change
  after update on public.deals
  for each row
  execute procedure public.log_deal_stage_change();
