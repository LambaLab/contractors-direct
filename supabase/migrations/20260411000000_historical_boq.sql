-- Historical BOQ data: projects, categories, line items, pricing overrides

-- Projects extracted from historical PDFs/Excel files
create table historical_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  contractor_name text,
  project_location text,
  project_type text,
  total_area_sqm numeric(10, 2),
  grand_total_aed numeric(14, 2) not null,
  source_filename text not null,
  revision text,
  is_latest_revision boolean not null default true,
  source_boq_draft_id uuid references boq_drafts(id) on delete set null,
  extracted_at timestamptz default now(),
  created_at timestamptz default now()
);

-- BOQ categories within each project
create table historical_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references historical_projects(id) on delete cascade not null,
  name text not null,
  normalized_name text not null,
  category_total_aed numeric(14, 2) not null,
  created_at timestamptz default now()
);

-- Individual BOQ line items
create table historical_line_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references historical_categories(id) on delete cascade not null,
  project_id uuid references historical_projects(id) on delete cascade not null,
  sr_no text,
  description text not null,
  quantity numeric(12, 3),
  unit text,
  unit_rate_aed numeric(12, 2),
  total_aed numeric(14, 2) not null,
  is_subtotal boolean default false,
  normalized_description text,
  scope_item_id text,
  created_at timestamptz default now()
);

-- Pricing overrides set by the CD team in the Price Book
create table pricing_overrides (
  id uuid primary key default gen_random_uuid(),
  scope_item_id text,
  item_description text not null,
  unit text not null,
  override_min_aed numeric(12, 2) not null,
  override_max_aed numeric(12, 2) not null,
  notes text,
  updated_by uuid references admin_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(item_description, unit)
);

-- Add deviation_flags to boq_drafts
alter table boq_drafts add column if not exists deviation_flags jsonb;

-- Add cost tracking + BOQ reference to project_tasks
alter table project_tasks add column if not exists boq_line_item_ref text;
alter table project_tasks add column if not exists estimated_cost_aed numeric(12, 2);
alter table project_tasks add column if not exists actual_cost_aed numeric(12, 2);

-- Indexes for fast lookup
create index idx_hist_line_items_scope on historical_line_items(scope_item_id);
create index idx_hist_line_items_unit on historical_line_items(unit);
create index idx_hist_line_items_project on historical_line_items(project_id);
create index idx_hist_categories_normalized on historical_categories(normalized_name);
create index idx_hist_projects_type on historical_projects(project_type);
create index idx_hist_projects_location on historical_projects(project_location);
create index idx_hist_projects_source_boq on historical_projects(source_boq_draft_id);
create index idx_pricing_overrides_scope on pricing_overrides(scope_item_id);
create index idx_pricing_overrides_desc_unit on pricing_overrides(item_description, unit);

-- Materialized view for fast aggregate pricing queries
create materialized view pricing_summary as
select
  scope_item_id,
  unit,
  count(*) as sample_count,
  min(unit_rate_aed) as rate_min,
  max(unit_rate_aed) as rate_max,
  avg(unit_rate_aed) as rate_avg,
  percentile_cont(0.25) within group (order by unit_rate_aed) as rate_p25,
  percentile_cont(0.50) within group (order by unit_rate_aed) as rate_median,
  percentile_cont(0.75) within group (order by unit_rate_aed) as rate_p75
from historical_line_items
where unit_rate_aed > 0
  and is_subtotal = false
  and scope_item_id is not null
group by scope_item_id, unit;

create unique index idx_pricing_summary_scope_unit on pricing_summary(scope_item_id, unit);

-- No RLS needed: these tables are accessed only via service role client in API routes.
-- Admin-only access is enforced at the application layer (verifyAdmin middleware).
