-- Ensure pipeline stage colors are always present

update public.pipeline_stages
set color = '#e2e8f0'
where color is null or btrim(color) = '';

alter table public.pipeline_stages
  alter column color set default '#e2e8f0',
  alter column color set not null;

