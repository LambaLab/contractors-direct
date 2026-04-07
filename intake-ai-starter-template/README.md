# AI Intake Conversation Starter Template

AI-powered conversational intake system adapted for Contractors Direct. Features rich UI, streaming responses, scope detection, confidence scoring, and session resilience.

## Stack

- **Next.js App Router** (server + client)
- **Claude API** (Anthropic SDK, streaming, tool use)
- **Supabase** (auth, database, realtime)
- **Tailwind CSS** + **shadcn/ui** (Radix UI)

## Architecture Overview

```
User types message
    |
    v
useIntakeChat.ts (React hook - manages state, streaming, localStorage)
    |
    v
POST /api/intake/chat (SSE streaming endpoint)
    |
    v
Claude API (with system-prompt.ts + tools.ts)
    |
    v
Streaming events: text -> transition_text -> partial_question -> partial_result -> partial_modules
    |
    v
QuickReplies.tsx renders response options (list cards / pills / multi-select)
    |
    v
ModuleProgressCard.tsx tracks detected modules
    |
    v
POST /api/intake/sync-messages (persists to Supabase)
```

## File Map & What to Customize

### Layer 1: AI Brain (CUSTOMIZE THESE FIRST)

| File | What to change |
|------|---------------|
| `lib/ai/system-prompt.ts` | Rewrite conversation phases, personality, module detection rules, confidence scoring for YOUR domain |
| `lib/ai/tools.ts` | Update the UPDATE_PROPOSAL_TOOL schema with YOUR structured output fields |
| `lib/modules/catalog.ts` | Replace with YOUR service/product catalog (names, descriptions, pricing tiers, icons) |
| `lib/modules/dependencies.ts` | Define YOUR module dependency graph |
| `lib/pricing/engine.ts` | Adapt pricing calculation to YOUR business model |

### Layer 2: API Routes (LIGHT CUSTOMIZATION)

| File | What to change |
|------|---------------|
| `app/api/intake/chat/route.ts` | Change Claude model, adjust SSE event names if needed |
| `app/api/intake/session/route.ts` | Adjust session creation logic for your auth model |
| `app/api/intake/sync-messages/route.ts` | Update Supabase table names if different |
| `app/api/proposals/generate/route.ts` | Rewrite generation prompt for YOUR deliverable type |
| `app/api/admin/proposals/[id]/tasks/generate/route.ts` | Customize task breakdown generation |

### Layer 3: Session & Types (MOSTLY REUSABLE)

| File | What to change |
|------|---------------|
| `lib/session.ts` | Already uses `cd_` prefix. Everything else is domain-agnostic |
| `lib/intake-types.ts` | Reusable as-is (QuickReply types) |
| `lib/intake-utils.ts` | Reusable as-is (serialization helpers) |

### Layer 4: React Hook (REUSABLE)

| File | What to change |
|------|---------------|
| `hooks/useIntakeChat.ts` | Change localStorage key prefixes. Core streaming/state logic is domain-agnostic |

### Layer 5: UI Components (MOSTLY REUSABLE)

| File | What to change |
|------|---------------|
| `components/intake/ChatPanel.tsx` | Reusable - handles messages, scroll, input |
| `components/intake/MessageBubble.tsx` | Reusable - role styling, editing, inline pills |
| `components/intake/QuickReplies.tsx` | Reusable - list cards, pills, multi-select, keyboard shortcuts |
| `components/intake/TypingIndicator.tsx` | Reusable as-is |
| `components/intake/ConfidenceBar.tsx` | Reusable as-is |
| `components/intake/ModuleProgressCard.tsx` | Rename "modules" to your domain term |
| `components/intake/ModuleCard.tsx` | Update icons/styling for your domain |
| `components/intake/PauseCheckpoint.tsx` | Update pause messaging for your domain |
| `components/intake/IntakeLayout.tsx` | Reusable - split layout, draggable divider |
| `components/intake/IntakeOverlay.tsx` | Update branding (colors, logos) |
| `components/intake/ModulesPanel.tsx` | Rename/restyle for your domain |
| `components/intake/MobileBottomDrawer.tsx` | Reusable as-is |
| `components/intake/MinimizedBar.tsx` | Update branding |
| `components/intake/AuthGateModal.tsx` | Update copy for your auth flow |
| `components/intake/SaveForLaterModal.tsx` | Update copy |
| `components/intake/SessionLoadingScreen.tsx` | Update branding |
| `components/intake/ProposalDrawer.tsx` | Rename "proposals" to your domain term |
| `components/intake/ModuleDivider.tsx` | Reusable as-is |

### Layer 6: Database (CUSTOMIZE)

| File | What to change |
|------|---------------|
| `supabase/migrations/001_initial_schema.sql` | Add/remove columns for your domain. Core tables (sessions, proposals, chat_messages) are reusable |

## Key Patterns Worth Understanding

### 1. Conversation Phases (system-prompt.ts)
The AI follows a 3-phase structure:
- **Discovery** - broad questions to understand scope
- **Deep Dive** - per-module detailed questions
- **Wrap Up** - confirm and transition to proposal

### 2. Rich Quick Replies (tools.ts + QuickReplies.tsx)
Two styles:
- `list` - full cards with title + description rows
- `pills` - compact chips for simple choices
Both support multi-select with confirm button and custom input fallback.

### 3. Streaming Architecture (chat/route.ts + useIntakeChat.ts)
SSE events stream progressively:
1. `text` - assistant message content
2. `transition_text` - bridge text before the question
3. `partial_question` - the follow-up question
4. `partial_result` - structured data (modules, confidence, etc.)
5. `partial_modules` - module detection updates

### 4. Session Resilience (session.ts)
- 7-day session age tracking with auto-clear
- Auto-retry with exponential backoff (2s -> 10s, 6 attempts)
- Fetch timeout via AbortController (15s)
- Visibility change handler for tab-switch recovery
- Auth fallback when Supabase auth fails

### 5. Module Detection & Confidence (system-prompt.ts + useIntakeChat.ts)
- AI detects modules from conversation context
- Confidence score (0-100) drives UI behavior
- At 60%+ confidence: pause checkpoint with save/continue options
- Module dependencies auto-resolve on add/remove

### 6. Pause Checkpoints (PauseCheckpoint.tsx)
At high confidence, the AI pauses and offers:
- Save for later (email capture)
- Keep going (continue deep dive)
- View proposal (generate full proposal)

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-claude-api-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Quick Start for a New Project

1. Copy this template into your Next.js project
2. Install deps: `npm install @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr`
3. Run the SQL migration against your Supabase project
4. Set environment variables
5. Customize Layer 1 files (system prompt, tools, catalog)
6. Update localStorage prefixes in session.ts and useIntakeChat.ts
7. Start building!
