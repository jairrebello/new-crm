-- Migration: add delivery/read timestamps for outbound messages

alter table public.conversation_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

create index if not exists conversation_messages_status_idx
  on public.conversation_messages (tenant_id, status, created_at desc);

