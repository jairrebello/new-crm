-- Migration: CRM Core Schema (Contacts, Accounts, Pipelines, Deals, History)

-- ACCOUNTS (Companies)
create table public.accounts (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    name text not null,
    domain text,
    industry text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CONTACTS
create table public.contacts (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    account_id uuid references public.accounts(id) on delete set null,
    name text not null,
    email text,
    phone text,
    document text,
    job_title text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (tenant_id, email),
    unique (tenant_id, phone)
);

-- PIPELINES
create table public.pipelines (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    name text not null,
    is_default boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PIPELINE STAGES
create table public.pipeline_stages (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    pipeline_id uuid references public.pipelines(id) on delete cascade not null,
    name text not null,
    color text default '#e2e8f0',
    sort_order integer not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- DEALS (Oportunidades)
create table public.deals (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    pipeline_id uuid references public.pipelines(id) on delete cascade not null,
    stage_id uuid references public.pipeline_stages(id) on delete set null,
    contact_id uuid references public.contacts(id) on delete set null,
    account_id uuid references public.accounts(id) on delete set null,
    owner_user_id uuid references public.users(id) on delete set null,
    title text not null,
    deal_value numeric(12,2) default 0,
    status text default 'open', -- 'open', 'won', 'lost'
    source text,
    priority text default 'medium', -- 'low', 'medium', 'high'
    expected_close_date date,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- DEAL STAGE HISTORY
create table public.deal_stage_history (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    deal_id uuid references public.deals(id) on delete cascade not null,
    from_stage_id uuid references public.pipeline_stages(id) on delete set null,
    to_stage_id uuid references public.pipeline_stages(id) on delete set null,
    user_id uuid references public.users(id) on delete set null,
    changed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.deal_stage_history enable row level security;

-- Create generic tenant isolation policies for all tables
create policy "Tenant Isolation: Accounts" on public.accounts for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));

create policy "Tenant Isolation: Contacts" on public.contacts for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));

create policy "Tenant Isolation: Pipelines" on public.pipelines for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));

create policy "Tenant Isolation: Pipeline Stages" on public.pipeline_stages for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));

create policy "Tenant Isolation: Deals" on public.deals for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));

create policy "Tenant Isolation: Deal History" on public.deal_stage_history for all
    using (tenant_id in (select tenant_id from public.tenant_users where user_id = auth.uid()));
