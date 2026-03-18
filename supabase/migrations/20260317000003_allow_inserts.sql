-- Migration: Allow inserts for Multitenant tables

-- 1. Tenants: Any authenticated user can create a new tenant (workspace)
create policy "Users can create tenants" on public.tenants for insert 
    with check (auth.role() = 'authenticated');

-- 2. Tenant Users: A user can link themselves to a tenant
create policy "Users can link themselves" on public.tenant_users for insert 
    with check (user_id = auth.uid());

-- 3. Pipelines: Users can create pipelines in their tenants
-- (Since get_user_tenant_ids() relies on tenant_users, the user must be linked first)
create policy "Users can create pipelines" on public.pipelines for insert 
    with check (tenant_id in (select public.get_user_tenant_ids()));

-- 4. Pipeline Stages: Users can create stages in their tenants
create policy "Users can create pipeline stages" on public.pipeline_stages for insert 
    with check (tenant_id in (select public.get_user_tenant_ids()));

-- Let's also ensure they can update their own tenants
create policy "Users can update their tenants" on public.tenants for update
    using (id in (select public.get_user_tenant_ids()));
