-- Conversas ignoradas (ex.: contatos pessoais) — somem da caixa de entrada principal

alter table public.conversations
  add column if not exists ignored boolean default false not null;

create index if not exists conversations_tenant_ignored_last_msg_idx
  on public.conversations (tenant_id, ignored, last_message_at desc nulls last);
