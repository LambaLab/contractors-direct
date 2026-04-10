-- Daniel voice-script integration: commercial fit-out support + intake file uploads
--
-- Context: adapting the web intake assistant to mirror Daniel (the voice AI agent)
-- priority question order. Daniel handles both residential and commercial fit-outs,
-- asks for floor plans / CAD files early, and captures ownership + budget.
--
-- No new columns on `leads`: all new qualifying fields (ownership, budget_aed_stated,
-- has_floor_plans, wants_project_management, contractor_quote_count, full_scope_notes,
-- uploaded_files) live inside `leads.metadata` jsonb. A follow-up migration can promote
-- any of these to columns if admin dashboards need to filter on them.

-- 1. Expand property_type to include commercial fit-out types
alter table leads drop constraint if exists leads_property_type_check;
alter table leads add constraint leads_property_type_check
  check (property_type in ('villa', 'apartment', 'townhouse', 'penthouse', 'office', 'retail', 'warehouse'));

-- 2. Expand condition to include commercial fit-out vocabulary
-- Residential: new, needs_refresh, major_renovation, shell
-- Commercial: fitted, semi_fitted, shell_and_core
alter table leads drop constraint if exists leads_condition_check;
alter table leads add constraint leads_condition_check
  check (condition in ('new', 'needs_refresh', 'major_renovation', 'shell', 'fitted', 'semi_fitted', 'shell_and_core'));

-- 3. Create private storage bucket for intake documents
-- Holds floor plans, CAD files, and site photos uploaded during the intake chat.
-- All access is via service-role key from the server route /api/intake/upload,
-- so no RLS policies are needed on storage.objects for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-documents',
  'intake-documents',
  false,
  52428800, -- 50 MB per file
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/vnd.dwg',
    'application/acad',
    'application/x-acad',
    'application/autocad_dwg',
    'application/dwg',
    'application/x-dwg',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;
