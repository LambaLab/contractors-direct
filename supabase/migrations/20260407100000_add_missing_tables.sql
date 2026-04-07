-- Admin users
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role in ('super_admin', 'admin')),
  added_by text,
  created_at timestamptz default now()
);

-- OTP codes for client verification
create table if not exists otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  lead_id uuid references leads(id) on delete cascade not null,
  session_id text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz default now()
);

-- Budget proposals
create table if not exists budget_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  proposal_id uuid,
  amount numeric(12, 2) not null default 0,
  client_notes text,
  internal_notes text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'countered', 'call_requested')),
  client_response text,
  responded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Lead slug history (for URL sharing)
create table if not exists lead_slug_history (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  lead_id uuid references leads(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Project tasks (generated from BOQ/scope)
create table if not exists project_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  parent_id uuid,
  title text not null,
  scope_id text,
  description text,
  complexity text,
  status text not null default 'todo',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add missing columns to leads table
alter table leads add column if not exists slug text;
alter table leads add column if not exists saved_at timestamptz;
alter table leads add column if not exists metadata jsonb;
alter table leads add column if not exists admin_notes text;
alter table leads add column if not exists prd text;
alter table leads add column if not exists technical_architecture text;
alter table leads add column if not exists timeline text;
alter table leads add column if not exists task_breakdown jsonb;
alter table leads add column if not exists milestone_plan jsonb;
alter table leads add column if not exists email_auth_token text;
alter table leads add column if not exists email_auth_token_expires_at timestamptz;

-- Seed the first admin user
insert into admin_users (email, role) values ('admin@contractorsdirect.com', 'super_admin')
on conflict (email) do nothing;
