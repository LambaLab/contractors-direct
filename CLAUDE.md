# Contractors Direct

A high-trust, AI-orchestrated renovation management platform for the UAE. It acts as a Digital Project Management Office (PMO) — sitting between homeowners and a curated network of specialized contractors — standardizing pricing, automating the project schedule, securing funds in escrow, and managing communications end-to-end.

The platform's primary success metric: **the client should never need to ask "what's the latest update?"** Live project transparency is the defining feature.

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`) — conversational intake, BOQ draft generation, confidence scoring
- **WhatsApp:** Twilio Business API — contractor photo ingestion, OTP verification, outbound notifications
- **Email:** Resend — transactional notifications
- **File Storage:** Supabase Storage — project photos, documents, PDF exports
- **Real-time:** Supabase Realtime (WebSocket) — live dashboard updates
- **Hosting:** Vercel (global edge, zero-config CI/CD)

## Architecture

Portal-first: four distinct role-based portals, each protected by middleware enforcing role-based access control. A single Next.js monorepo serves all portals from one deployment.

```
app/
  (public)/
    page.tsx                  # Style card selection + AI intake entry
    intake/                   # AI chat consultation flow
    proposal/[sessionId]/     # OTP-gated proposal view
  (client)/
    dashboard/                # Client project tracker + ledger overview
    project/[id]/
      tracker/                # Live task/phase/milestone view
      ledger/                 # Financial ledger (funded/released/pending)
      documents/              # Document vault
      milestones/             # Milestone funding UI
  (contractor)/
    tasks/                    # Read-only task list + payment status
  (admin)/
    dashboard/                # God-view: Kanban, finance, alerts
    projects/                 # All active projects
    project/[id]/
      boq/                    # BOQ editor
      escrow/                 # Payment release controls
      triage/                 # Incoming photo queue
      tracker/                # Task management
    leads/                    # Incoming intake leads
  api/
    ai/intake/                # Claude conversational intake endpoint
    ai/boq/                   # AI BOQ draft generation
    auth/otp/                 # WhatsApp OTP send + verify
    whatsapp/webhook/         # Twilio inbound webhook (contractor photos)
    projects/                 # Project CRUD
    boq/                      # BOQ CRUD + locking
    escrow/                   # Ledger + payment release
    milestones/               # Milestone management
    tasks/                    # Task CRUD + status updates
    variation-orders/         # VO creation + funding flow
    disputes/                 # Dispute raise/resolve
    notifications/            # Multi-channel notification dispatch
    documents/                # Document vault CRUD
    pdf/home-manual/          # Digital Home Manual PDF export
components/
  intake/
    StyleCards.tsx            # 8 aesthetic style card selector
    AIChat.tsx                # Conversational intake interface
    ConfidenceGauge.tsx       # Live confidence score display
    ProposalView.tsx          # Gated proposal with BOQ preview
  tracker/
    ProjectTracker.tsx        # Live task/phase/milestone timeline
    TaskCard.tsx              # Individual task card
    MilestoneBar.tsx          # Milestone progress indicator
  admin/
    BOQEditor.tsx             # Spreadsheet-style BOQ editor
    TriageQueue.tsx           # Incoming photo review interface
    EscrowLedger.tsx          # Payment release controls
    GodViewKanban.tsx         # Pipeline Kanban across all projects
  shared/
    LedgerStatement.tsx       # Bank-statement-style financial view
    DocumentVault.tsx         # Categorized document repository
    NotificationBell.tsx      # In-app notification center
hooks/
  useProject.ts               # Project + task data
  useEscrow.ts                # Ledger state
  useRealtime.ts              # Supabase Realtime subscriptions
lib/
  supabase/client.ts          # Browser Supabase client
  supabase/server.ts          # Server Supabase client (API routes)
  ai/intake.ts                # Claude intake conversation logic
  ai/boq.ts                   # BOQ draft generation logic
  twilio/whatsapp.ts          # Inbound webhook + outbound messaging
  twilio/otp.ts               # WhatsApp OTP flow
  resend/notifications.ts     # Email notification templates
  pdf/home-manual.ts          # Digital Home Manual PDF generation
  types.ts                    # TypeScript type definitions
supabase/
  migrations/                 # SQL migration files
docs/
  plans/                      # Phase-by-phase implementation plans
```

## Database

Supabase PostgreSQL with Row Level Security (RLS) on all tables. Key principle: **no data is ever lost** — anonymous sessions are promoted to registered accounts atomically on OTP verification.

```sql
-- Core entities
projects              -- master project record + state machine
project_phases        -- phases within a project
tasks                 -- individual line items from BOQ
milestones            -- payment milestones

-- Intake + leads
intake_sessions       -- anonymous sessions (pre-OTP)
leads                 -- converted intake sessions (post-OTP)
boq_drafts            -- AI-generated BOQ, refined by admin

-- Financial
escrow_ledger         -- every financial event (funded/released/fee/refund)
variation_orders      -- formal scope changes
disputes              -- per-contractor dispute records

-- Communication
contractor_photos     -- inbound photos from WhatsApp triage
notifications         -- audit trail of all notifications sent
share_tokens          -- WhatsApp deep links (7-day expiry)

-- Documents
documents             -- property docs, NOCs, compliance certs
home_manuals          -- generated PDF records

-- Auth + access
users                 -- Supabase Auth users
contractor_profiles   -- contractor records (WhatsApp-first)
google_tokens         -- (future) calendar integration tokens
```

**Project state machine:** `draft` → `proposal_sent` → `boq_agreed` → `active` → `snagging` → `closed`

**BOQ rule:** BOQ can only be edited before the first client payment. Changes after locking become Variation Orders.

**Payment release rule (3 steps, no single action can release funds):**
1. Contractor submits completion request
2. Admin pins photo evidence to task
3. Admin clicks explicit release approval

## Role-Based Access

| Portal | Route | Auth | Description |
|---|---|---|---|
| Public / Intake | `/` | Open | Style cards, AI chat, proposal (OTP-gated) |
| Client | `/(client)/` | WhatsApp OTP | Dashboard, tracker, ledger, documents |
| Contractor | `/(contractor)/` | WhatsApp OTP | Read-only task list, payment status |
| Admin | `/(admin)/` | Email + password | Full operations, BOQ, escrow, triage |

Middleware enforces role checks on every request. The service role client is used only for public OTP verification pages to bypass RLS.

## AI: The Intake Flow

The intake is the platform's most critical first impression. It replaces the traditional consultation call.

**Step-by-step:**
1. **Style card selection** — Client picks from 8 curated aesthetics (Modern, Contemporary Arabic, Scandi, Industrial, Classic, Maximalist, Coastal, Minimalist). This signals cost tier and design direction to the AI immediately.
2. **AI chat consultation** — Conversational intake via Claude API. Collects property type, location, size (sqft), condition, and scope of works. Free-text fully supported.
3. **Live confidence score** — Percentage gauge updates as client provides more data. AI nudges toward missing "Core Four": property type, location, size, condition.
4. **Anonymous session capture** — Every input written to DB from first interaction, under an anonymous session ID. Zero data loss.
5. **Soft CTA** — At meaningful confidence threshold, AI offers ballpark proposal or discovery call. Both paths collect name + phone.
6. **WhatsApp OTP gate** — Phone verification converts anonymous session to registered account in a single atomic update. All prior data migrated.
7. **Gated proposal** — AED ballpark range + structured brief. AI output is the starting point, not the final quote.

**AI prompt guidelines:**
- System prompt includes UAE market context, AED pricing calibration, and the 8 style card cost tiers
- Never hallucinate specific line items — produce ranges, not fake precision
- Always extract: property_type, location, size_sqft, condition, style_preference, scope_description
- Confidence score formula: (fields_filled / total_fields) × quality_weight

## WhatsApp Bridge

Contractors send photos to the CD WhatsApp Business number. The platform ingests, triages, and pins them to tasks.

**Flow:**
1. Contractor sends photo to CD WhatsApp number
2. Twilio webhook fires → `api/whatsapp/webhook/`
3. Photo stored in Supabase Storage + record created in `contractor_photos`
4. Admin receives real-time notification in triage queue
5. Admin pins photo to a specific task → task status updates → client dashboard updates live

**Phone number mapping:** Each contractor's mobile is linked to their profile. Inbound messages are attributed automatically.

**OTP flow:** Clients verify via WhatsApp OTP before accessing full proposals or client portals.

## Notification System

Every significant event triggers all three channels simultaneously:
- **WhatsApp** — via Twilio outbound message
- **Email** — via Resend transactional template
- **In-app** — via Supabase Realtime push to connected clients

Trigger events: payment received, task completed, milestone funded, document uploaded, VO raised, dispute opened/resolved, manual admin update.

All notifications stored in `notifications` table for full audit trail.

## Design System

```
Background:   #FAFAF9  (warm white)
Text:         #1A1916  (soft black)
Border:       rgba(0,0,0,0.08)

Phase colors:
  Phase 1 - Intake:     #7F77DD  (purple)
  Phase 2 - Admin:      #1D9E75  (teal)
  Phase 3 - Payments:   #BA7517  (amber)
  Phase 4 - Comms:      #D85A30  (coral)
  Phase 5 - Go Live:    #888780  (gray)

Status colors:
  Funded:     #1D9E75  (green)
  Released:   #7F77DD  (purple)
  Pending:    #BA7517  (amber)
  Disputed:   #D85A30  (coral)
  Locked:     #888780  (gray)

Accent/CTA:   #7F77DD  (purple)
```

Font: System default + `font-sans` via Tailwind. No custom font imports needed for MVP.

## Key Business Rules (Enforced by Architecture)

- **Payment release requires 3 independent steps** — no single action releases funds
- **BOQ locked after first payment** — changes become Variation Orders with separate funding gate
- **Variation Orders block associated tasks** until client funds the delta
- **CD service fee auto-calculated** on every contractor payment release
- **Dispute scoped to one contractor** — does not affect other vendors on same project
- **Contractor data siloed by RLS** — each contractor queries only their own tasks
- **Anonymous session promoted, never restarted** — all prior data migrated atomically on OTP

## Build Phases

The platform is built in 5 sequential phases. Each phase is a standalone deliverable.

| Phase | Name | Key Deliverables |
|---|---|---|
| 1 | The Investor Demo | Style cards, AI intake, confidence score, WhatsApp OTP, gated proposal, lead capture |
| 2 | The Admin Engine | BOQ editor, AI BOQ draft, admin refinement, locking, project state machine |
| 3 | The Financial Core | Escrow ledger, 3-step payment release, live tracker, WebSocket sync |
| 4 | The Communication Layer | WhatsApp bridge, triage queue, multi-channel notifications, VOs, disputes |
| 5 | Go Live | Client portal, contractor portal, admin god-view, document vault, PDF export, production deploy |

**Current phase:** Start with Phase 1. Do not build Phase 2 features until Phase 1 is complete and tested.

## URLs (Production)

- **Platform:** `contractorsdirect.ae` (future)
- **Staging:** Vercel preview deployments on every push to `main`
- **Roadmap site:** `contractors-direct-roadmap.vercel.app`
- **GitHub:** `github.com/LambaLab/contractors-direct-roadmap`

## Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check
```

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=          # e.g. whatsapp:+14155238886
TWILIO_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# App
NEXT_PUBLIC_APP_URL=
```

Never commit `.env.local`. See `.env.example` for all required variables.

## Implementation Notes

- All Supabase queries go through `lib/supabase/client.ts` (browser) or `lib/supabase/server.ts` (server components + API routes)
- Service role client used only for public checkoff / OTP pages to bypass RLS
- AI routing: user input → Claude extracts intent + property details → confidence score recalculated → stored to DB
- Real-time: Supabase Realtime WebSocket channels per project — client dashboard subscribes on mount, unsubscribes on unmount
- Twilio webhook must be allowlisted in `middleware.ts` as a public path (no auth check)
- Photo storage path convention: `projects/{project_id}/photos/{timestamp}_{contractor_id}.jpg`
- Document storage path convention: `projects/{project_id}/documents/{category}/{filename}`

## Out of Scope (MVP)

- Native mobile app (iOS/Android)
- Integrated payment gateway (MVP uses manual bank transfer + admin-recorded receipt)
- Arabic language / RTL support
- BOQ pricing database (MVP uses AI estimation + admin expertise)
- Contractor rating and review system
- Developer portal integrations (Emaar, Nakheel direct API submission)
