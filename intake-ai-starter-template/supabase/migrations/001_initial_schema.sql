-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Intake Sessions (anonymous, pre-OTP)
create table intake_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Leads (intake results — draft until OTP verified)
create table leads (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references intake_sessions(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'proposal_sent', 'boq_agreed', 'active')),
  -- Property details (Core Four)
  property_type text check (property_type in ('villa', 'apartment', 'townhouse', 'penthouse', 'office')),
  location text,
  size_sqft integer,
  condition text check (condition in ('new', 'needs_refresh', 'major_renovation', 'shell')),
  style_preference text,
  -- AI-generated fields
  scope jsonb not null default '[]',
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  price_min integer not null default 0,
  price_max integer not null default 0,
  brief text not null default '',
  project_overview text,
  scope_summaries jsonb,
  project_name text,
  -- Contact info
  name text,
  phone text,
  email text,
  phone_verified_at timestamptz,
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages
create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'admin')),
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- BOQ drafts (AI-generated Bill of Quantities)
create table boq_drafts (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  version integer not null default 1,
  categories jsonb not null default '[]',
  grand_total_aed numeric(12, 2) not null default 0,
  assumptions text[] default '{}',
  exclusions text[] default '{}',
  locked boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table intake_sessions enable row level security;
alter table leads enable row level security;
alter table chat_messages enable row level security;
alter table boq_drafts enable row level security;

-- Intake Sessions: owner can read/write their own
create policy "intake_sessions_owner" on intake_sessions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Leads: owner can read
create policy "leads_owner_read" on leads
  for select using (auth.uid() = user_id);

-- Leads: owner can insert
create policy "leads_owner_insert" on leads
  for insert with check (auth.uid() = user_id);

-- Leads: owner can update draft/pending leads
create policy "leads_owner_update" on leads
  for update using (auth.uid() = user_id and status in ('draft', 'pending_review'));

-- Chat messages: owner can read via lead
create policy "chat_messages_owner" on chat_messages
  using (
    exists (
      select 1 from leads l
      where l.id = chat_messages.lead_id
      and l.user_id = auth.uid()
    )
  );

-- BOQ drafts: owner can read via lead
create policy "boq_drafts_owner" on boq_drafts
  using (
    exists (
      select 1 from leads l
      where l.id = boq_drafts.lead_id
      and l.user_id = auth.uid()
    )
  );
