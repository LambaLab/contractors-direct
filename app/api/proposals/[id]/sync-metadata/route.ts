import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Lightweight endpoint to sync lead metadata (confidence, scope, brief)
 * to Supabase without requiring email verification. This ensures leads
 * appear in the admin dashboard as soon as the AI starts analyzing them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const {
    sessionId,
    confidenceScore,
    modules: scope,
    brief,
    metadata,
    propertyType,
    sizeSqft,
    location,
    condition,
    stylePreference,
  } = await req.json()

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate ownership
  const { data: lead } = await supabase
    .from('leads')
    .select('id, metadata')
    .eq('id', id)
    .eq('session_id', sessionId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}
  if (typeof confidenceScore === 'number') update.confidence_score = confidenceScore
  if (Array.isArray(scope)) update.scope = scope
  if (typeof brief === 'string' && brief) update.brief = brief

  // Core Four — persisted as top-level columns so the admin estimator panel
  // (and any other server-side consumer) can read them straight off the lead
  // row without scraping chat history.
  const VALID_PROPERTY_TYPES = ['villa', 'apartment', 'townhouse', 'penthouse', 'office'] as const
  const VALID_CONDITIONS = ['new', 'needs_refresh', 'major_renovation', 'shell'] as const
  if (typeof propertyType === 'string' && (VALID_PROPERTY_TYPES as readonly string[]).includes(propertyType)) {
    update.property_type = propertyType
  }
  if (typeof sizeSqft === 'number' && sizeSqft > 0) update.size_sqft = sizeSqft
  if (typeof location === 'string' && location) update.location = location
  if (typeof condition === 'string' && (VALID_CONDITIONS as readonly string[]).includes(condition)) {
    update.condition = condition
  }
  if (typeof stylePreference === 'string' && stylePreference) update.style_preference = stylePreference

  if (metadata && typeof metadata === 'object') {
    // Merge with existing metadata so we don't clobber prior keys when the
    // client only sends a subset on a given turn.
    const prevMeta = (lead as { metadata?: Record<string, unknown> | null }).metadata ?? {}
    const merged = { ...prevMeta, ...metadata } as Record<string, unknown>
    update.metadata = merged
    if (metadata.projectName) update.project_name = metadata.projectName
    if (metadata.projectOverview) update.project_overview = metadata.projectOverview
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true })
  }

  const { error } = await supabase
    .from('leads')
    .update(update as any)
    .eq('id', id)

  if (error) {
    console.error('sync-metadata error:', error)
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
