-- Migration: Fix RLS Recursion on Multitenant queries

-- 1. Create a helper function to get the current user's tenant IDs
-- Using `security definer` bypasses RLS so it won't infinitely recurse on `tenant_users`
create or replace function public.get_user_tenant_ids()
returns setof uuid as $$
  select tenant_id from public.tenant_users where user_id = auth.uid();
$$ language sql security definer;

-- 2. Drop all recursive policies from initial schema
drop policy if exists "Users can view their tenants" on public.tenants;
drop policy if exists "Users can view their tenant settings" on public.tenant_settings;
drop policy if exists "Users can view co-workers" on public.users;
drop policy if exists "Users can view tenant_users for their tenants" on public.tenant_users;

-- 3. Drop all recursive policies from CRM Core schema
drop policy if exists "Tenant Isolation: Accounts" on public.accounts;
drop policy if exists "Tenant Isolation: Contacts" on public.contacts;
drop policy if exists "Tenant Isolation: Pipelines" on public.pipelines;
drop policy if exists "Tenant Isolation: Pipeline Stages" on public.pipeline_stages;
drop policy if exists "Tenant Isolation: Deals" on public.deals;
drop policy if exists "Tenant Isolation: Deal History" on public.deal_stage_history;


-- 4. Recreate policies utilizing the new helper function
---------------------------------------------------------

-- Tenants
create policy "Users can view their tenants" on public.tenants for select
    using (id in (select public.get_user_tenant_ids()));

-- Tenant Settings
create policy "Users can view their tenant settings" on public.tenant_settings for select
    using (tenant_id in (select public.get_user_tenant_ids()));

-- Users (Co-workers)
create policy "Users can view co-workers" on public.users for select
    using (
        auth.uid() = id -- self
        or id in (
            select user_id from public.tenant_users 
            where tenant_id in (select public.get_user_tenant_ids())
        )
    );

-- Tenant Users
create policy "Users can view tenant_users for their tenants" on public.tenant_users for select
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Accounts
create policy "Tenant Isolation: Accounts" on public.accounts for all
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Contacts
create policy "Tenant Isolation: Contacts" on public.contacts for all
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Pipelines
create policy "Tenant Isolation: Pipelines" on public.pipelines for all
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Pipeline Stages
create policy "Tenant Isolation: Pipeline Stages" on public.pipeline_stages for all
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Deals
create policy "Tenant Isolation: Deals" on public.deals for all
    using (tenant_id in (select public.get_user_tenant_ids()));

-- CRM Core Deal History
create policy "Tenant Isolation: Deal History" on public.deal_stage_history for all
    using (tenant_id in (select public.get_user_tenant_ids()));
