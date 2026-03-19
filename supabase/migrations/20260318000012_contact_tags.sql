-- Migration: Contact Tags
-- Adds tags to contacts with a many-to-many join table

-- TAGS (label system per tenant)
create table public.tags (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  name_lower text not null,
  color text default '#e2e8f0',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index tags_tenant_name_lower_unique on public.tags(tenant_id, name_lower);
create index tags_tenant_id_idx on public.tags(tenant_id);

alter table public.tags enable row level security;

create policy "Tenant Isolation: Tags" on public.tags for all
using (
  tenant_id in (
    select tenant_id from public.tenant_users where user_id = auth.uid()
  )
);

-- CONTACT TAGS (many-to-many)
create table public.contact_tags (
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (contact_id, tag_id)
);

create index contact_tags_tag_id_idx on public.contact_tags(tag_id);
create index contact_tags_contact_id_idx on public.contact_tags(contact_id);
create index contact_tags_tenant_id_idx on public.contact_tags(tenant_id);

alter table public.contact_tags enable row level security;

-- Enforces:
-- - current user belongs to tenant_id
-- - contact_id belongs to same tenant_id
-- - tag_id belongs to same tenant_id
create policy "Tenant Isolation: Contact Tags" on public.contact_tags for all
using (
  tenant_id in (
    select tenant_id from public.tenant_users where user_id = auth.uid()
  )
  and tenant_id = (select c.tenant_id from public.contacts c where c.id = contact_id)
  and tenant_id = (select t.tenant_id from public.tags t where t.id = tag_id)
);

