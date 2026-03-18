-- Migration: Inbox / WhatsApp (Conversations + Messages + Instances + Webhook logs)

-- WHATSAPP INSTANCES
create table public.whatsapp_instances (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  provider text default 'uazapi' not null,
  provider_instance_key text not null, -- instance identifier in the provider
  phone_number text,
  api_base_url text,
  api_token text,
  webhook_secret text not null,
  is_active boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (provider, provider_instance_key)
);

-- CONVERSATIONS
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_phone text, -- fallback key when contact_id is null
  contact_name text,
  assigned_user_id uuid references public.users(id) on delete set null,
  status text default 'open' not null, -- open | waiting | closed
  unread_count integer default 0 not null,
  last_message_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index conversations_tenant_last_message_idx
  on public.conversations (tenant_id, last_message_at desc nulls last);
create index conversations_contact_phone_idx
  on public.conversations (tenant_id, contact_phone);
create index conversations_contact_id_idx
  on public.conversations (tenant_id, contact_id);

-- CONVERSATION MESSAGES
create table public.conversation_messages (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete cascade not null,
  direction text not null, -- inbound | outbound
  body text not null,
  external_id text,
  status text default 'stored' not null, -- stored | sent | failed
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

create index conversation_messages_conv_created_idx
  on public.conversation_messages (conversation_id, created_at);
create index conversation_messages_external_id_idx
  on public.conversation_messages (whatsapp_instance_id, external_id);

-- WEBHOOK LOG
create table public.webhooks_log (
  id uuid default uuid_generate_v4() primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  provider text default 'uazapi' not null,
  event_type text,
  external_id text,
  payload jsonb not null,
  received_at timestamptz default now() not null,
  processed_at timestamptz,
  status text default 'received' not null, -- received | processed | failed
  error text
);

create index webhooks_log_received_idx on public.webhooks_log (received_at desc);
create index webhooks_log_external_idx on public.webhooks_log (provider, external_id);

-- RLS
alter table public.whatsapp_instances enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.webhooks_log enable row level security;

-- Policies using get_user_tenant_ids() to avoid recursion
create policy "Tenant Isolation: WhatsApp Instances" on public.whatsapp_instances
  for all
  using (tenant_id in (select public.get_user_tenant_ids()))
  with check (tenant_id in (select public.get_user_tenant_ids()));

create policy "Tenant Isolation: Conversations" on public.conversations
  for all
  using (tenant_id in (select public.get_user_tenant_ids()))
  with check (tenant_id in (select public.get_user_tenant_ids()));

create policy "Tenant Isolation: Conversation Messages" on public.conversation_messages
  for all
  using (tenant_id in (select public.get_user_tenant_ids()))
  with check (tenant_id in (select public.get_user_tenant_ids()));

create policy "Tenant Isolation: Webhooks Log" on public.webhooks_log
  for all
  using (tenant_id in (select public.get_user_tenant_ids()))
  with check (tenant_id in (select public.get_user_tenant_ids()));

