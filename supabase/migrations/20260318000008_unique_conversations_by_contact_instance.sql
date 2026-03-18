-- Migration: prevent duplicate conversations per contact/instance

create unique index if not exists conversations_unique_contact_per_instance
  on public.conversations (tenant_id, whatsapp_instance_id, contact_id)
  where contact_id is not null;

create unique index if not exists conversations_unique_phone_per_instance_when_no_contact
  on public.conversations (tenant_id, whatsapp_instance_id, contact_phone)
  where contact_id is null and contact_phone is not null;

