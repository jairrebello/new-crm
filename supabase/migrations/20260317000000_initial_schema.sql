-- Migration: Initial Schema (Tenants, Users, Roles)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ROLES
create table public.roles (
    id uuid default uuid_generate_v4() primary key,
    name text not null unique, -- e.g., 'superadmin', 'owner', 'admin', 'manager', 'agent', 'viewer'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Default Roles
insert into public.roles (name) values
    ('superadmin'),
    ('owner'),
    ('admin'),
    ('manager'),
    ('agent'),
    ('viewer');

-- TENANTS
create table public.tenants (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    slug text not null unique,
    timezone text default 'America/Sao_Paulo',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TENANT SETTINGS
create table public.tenant_settings (
    tenant_id uuid references public.tenants(id) on delete cascade primary key,
    branding_color text default '#000000',
    logo_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- USERS (extends auth.users)
create table public.users (
    id uuid references auth.users(id) on delete cascade primary key,
    email text not null unique,
    first_name text,
    last_name text,
    avatar_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TENANT USERS (Junction table for multitenancy & RBAC)
create table public.tenant_users (
    id uuid default uuid_generate_v4() primary key,
    tenant_id uuid references public.tenants(id) on delete cascade not null,
    user_id uuid references public.users(id) on delete cascade not null,
    role_id uuid references public.roles(id) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(tenant_id, user_id)
);

-- Set up RLS (Row Level Security)

alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.users enable row level security;
alter table public.tenant_users enable row level security;
alter table public.roles enable row level security;

-- Roles: everyone can read roles
create policy "Roles are readable by everyone" on public.roles for select using (true);

-- Tenants: users can see tenants they belong to (via tenant_users)
create policy "Users can view their tenants" on public.tenants for select
    using (auth.uid() in (
        select user_id from public.tenant_users where tenant_id = id
    ));

-- Tenant Settings: users can see settings for their tenants
create policy "Users can view their tenant settings" on public.tenant_settings for select
    using (tenant_id in (
        select tenant_id from public.tenant_users where user_id = auth.uid()
    ));

-- Users: users can view other users in the same tenant
create policy "Users can view co-workers" on public.users for select
    using (
        auth.uid() = id -- self
        or id in ( -- co-workers
            select user_id from public.tenant_users 
            where tenant_id in (
                select tenant_id from public.tenant_users where user_id = auth.uid()
            )
        )
    );

create policy "Users can update their own profile" on public.users for update
    using (auth.uid() = id);

-- Tenant Users: users can see mappings for their tenants
create policy "Users can view tenant_users for their tenants" on public.tenant_users for select
    using (tenant_id in (
        select tenant_id from public.tenant_users where user_id = auth.uid()
    ));

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

