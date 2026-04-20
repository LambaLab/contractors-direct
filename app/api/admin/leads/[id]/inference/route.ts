import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { inferEstimate } from '@/lib/estimator/intakeInference'

/**
 * GET /api/admin/leads/[id]/inference
 *
 * Recompute the budget-estimator inference for a lead. Reads the lead's
 * current fields + chat transcript and runs the same inference function the
 * intake chat route uses, so admin sees what the client would see right now.
 * Returns null inputs (status 200) when the 3 hard keys aren't present yet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params

  const [leadResult, msgsResult] = await Promise.all([
    supabase
      .from('leads')
      .select('property_type, location, size_sqft, metadata, project_overview, brief')
      .eq('id', id)
      .single(),
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('lead_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (leadResult.error || !leadResult.data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const lead = leadResult.data as {
    property_type: string | null
    location: string | null
    size_sqft: number | null
    metadata: Record<string, unknown> | null
    project_overview: string | null
    brief: string | null
  }
  const meta = lead.metadata ?? {}

  // conversationText for the inference helper: only user-typed messages, so
  // detection regexes ("revamp my kitchen", "knock down a wall", etc.) match
  // exactly what they would during live chat.
  const userMessages = (msgsResult.data ?? []).filter(
    (m: { role: string }) => m.role === 'user',
  )
  const conversationText = userMessages
    .map((m: { content: string | null }) => m.content ?? '')
    .join(' ')

  // Fallback scrape blob for the Core Four — combines user messages, assistant
  // messages (often quote the user's answer back: "1,500 sq ft townhouse..."),
  // and the AI's structured projectOverview / brief. We scan this blob ONLY
  // to fill `property_type` and `size_sqft` when the lead row is still null.
  const allMessageContent = (msgsResult.data ?? [])
    .map((m: { content: string | null }) => m.content ?? '')
    .join(' ')
  const projectOverview =
    (typeof meta.projectOverview === 'string' ? (meta.projectOverview as string) : '') ||
    (lead.project_overview ?? '')
  const fallbackBlob = `${allMessageContent} ${projectOverview} ${lead.brief ?? ''}`.toLowerCase()

  const propertyTypeFallback = (() => {
    const types = ['villa', 'apartment', 'townhouse', 'penthouse', 'office'] as const
    for (const t of types) if (new RegExp(`\\b${t}s?\\b`).test(fallbackBlob)) return t
    return null
  })()
  const sizeSqftFallback = (() => {
    // Explicit unit, with optional comma separator (e.g. "1,500 sq ft")
    const m = fallbackBlob.match(
      /(\d{1,2}[,.]?\d{3}|\d{2,5})\s*(?:sq\s*ft|sqft|sf|square\s*feet|ft\^?2|ft2)\b/,
    )
    if (m) return parseInt(m[1].replace(/[,.]/g, ''), 10)
    // Explicit unit in sqm — convert
    const m2 = fallbackBlob.match(
      /(\d{1,2}[,.]?\d{3}|\d{2,5})\s*(?:sq\s*m|sqm|m\^?2|m2|square\s*met(?:re|er)s?)\b/,
    )
    if (m2) return Math.round(parseInt(m2[1].replace(/[,.]/g, ''), 10) * 10.7639)
    return null
  })()

  const knownFields = {
    project_nature: typeof meta.project_nature === 'string' ? (meta.project_nature as string) : null,
    property_type: lead.property_type ?? propertyTypeFallback,
    size_sqft: lead.size_sqft ?? sizeSqftFallback,
    finish_level: typeof meta.finish_level === 'string' ? (meta.finish_level as string) : null,
    location: lead.location ?? null,
  }

  const result = inferEstimate({ knownFields, conversationText })

  // Tag each input source so the admin disclosure can highlight whether the
  // value came from the lead row, was scraped from chat as a fallback, or is
  // genuinely missing. The estimator helper itself doesn't know — we know
  // here because we control which value was passed in.
  function source(
    fromLead: unknown,
    fromFallback: unknown,
  ): 'user-stated' | 'chat-scraped' | 'AI-defaulted' | 'missing' {
    if (fromLead !== null && fromLead !== undefined && fromLead !== '') return 'user-stated'
    if (fromFallback !== null && fromFallback !== undefined && fromFallback !== '') return 'chat-scraped'
    return 'missing'
  }
  const inputSources = {
    project_nature: knownFields.project_nature ? 'user-stated' : 'AI-defaulted',
    property_type: source(lead.property_type, propertyTypeFallback),
    size_sqft: source(lead.size_sqft, sizeSqftFallback),
    finish_level: knownFields.finish_level ? 'user-stated' : 'AI-defaulted',
    location: knownFields.location ? 'user-stated' : 'AI-defaulted',
  } as const

  return new NextResponse(
    JSON.stringify({
      knownFields,
      inputSources,
      inference: result,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
