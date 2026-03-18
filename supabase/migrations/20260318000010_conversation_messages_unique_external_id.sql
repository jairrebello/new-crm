-- Migration: Ensure idempotency for conversation_messages by provider external_id

create unique index if not exists conversation_messages_unique_external_id_per_instance
  on public.conversation_messages (tenant_id, whatsapp_instance_id, external_id)
  where external_id is not null;

