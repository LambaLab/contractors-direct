import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeCategoryName, normalizeDescription } from '@/lib/pricing/category-map'

/**
 * POST /api/admin/boq/[id]/lock
 * Lock a BOQ draft (no more edits) and auto-ingest its line items
 * into the historical pricing database.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any
  const { id: boqId } = await params

  // Fetch the BOQ draft
  const { data: boq, error: boqError } = await supabase
    .from('boq_drafts')
    .select('*, leads!boq_drafts_lead_id_fkey(property_type, location, project_name, size_sqft)')
    .eq('id', boqId)
    .single()

  if (boqError || !boq) {
    return NextResponse.json({ error: 'BOQ not found' }, { status: 404 })
  }

  if (boq.locked) {
    return NextResponse.json({ error: 'BOQ is already locked' }, { status: 409 })
  }

  // Lock the BOQ
  const { error: lockError } = await supabase
    .from('boq_drafts')
    .update({ locked: true, updated_at: new Date().toISOString() })
    .eq('id', boqId)

  if (lockError) {
    return NextResponse.json({ error: lockError.message }, { status: 500 })
  }

  // Auto-ingest into historical pricing database
  const categories = boq.categories as Array<{
    name: string
    line_items: Array<{
      description: string
      unit: string
      quantity: number
      unit_price_aed: number
      subtotal_aed: number
    }>
    category_subtotal_aed: number
  }>

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ success: true, ingested: false, reason: 'No categories to ingest' })
  }

  // Check if already ingested (by source_boq_draft_id)
  const { data: existingProject } = await supabase
    .from('historical_projects')
    .select('id')
    .eq('source_boq_draft_id', boqId)
    .maybeSingle()

  if (existingProject) {
    // Already ingested, delete old data and re-ingest
    await supabase.from('historical_projects').delete().eq('id', existingProject.id)
  }

  // Calculate grand total from categories for validation
  const calculatedTotal = categories.reduce((sum, cat) => sum + (cat.category_subtotal_aed ?? 0), 0)
  const grandTotal = boq.grand_total_aed ?? calculatedTotal

  // Validate: at least some line items have non-zero rates
  const hasValidItems = categories.some(cat =>
    cat.line_items?.some(item => item.unit_price_aed > 0 && item.quantity > 0)
  )

  if (!hasValidItems) {
    return NextResponse.json({ success: true, ingested: false, reason: 'No valid line items with pricing' })
  }

  // Extract lead metadata
  const lead = boq.leads as { property_type: string | null; location: string | null; project_name: string | null; size_sqft: number | null } | null
  const projectType = lead?.property_type ?? 'unknown'
  const location = lead?.location ?? null
  const projectName = lead?.project_name ?? 'Unnamed Project'

  // Insert historical project
  const { data: project, error: projError } = await supabase
    .from('historical_projects')
    .insert({
      project_name: projectName,
      contractor_name: 'Contractors Direct',
      project_location: location,
      project_type: projectType,
      total_area_sqm: lead?.size_sqft ? lead.size_sqft * 0.0929 : null, // sqft to sqm
      grand_total_aed: grandTotal,
      source_filename: `boq_draft_${boqId}`,
      revision: `v${boq.version}`,
      is_latest_revision: true,
      source_boq_draft_id: boqId,
    })
    .select('id')
    .single()

  if (projError || !project) {
    console.error('Failed to insert historical project:', projError)
    return NextResponse.json({ success: true, ingested: false, reason: projError?.message })
  }

  let totalItems = 0

  for (const category of categories) {
    const normalizedName = normalizeCategoryName(category.name) ?? category.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

    const { data: cat, error: catError } = await supabase
      .from('historical_categories')
      .insert({
        project_id: project.id,
        name: category.name,
        normalized_name: normalizedName,
        category_total_aed: category.category_subtotal_aed ?? 0,
      })
      .select('id')
      .single()

    if (catError || !cat) continue

    const lineItems = (category.line_items ?? [])
      .filter(item => item.description && item.subtotal_aed > 0)
      .map((item, idx) => ({
        category_id: cat.id,
        project_id: project.id,
        sr_no: `${idx + 1}`,
        description: item.description,
        quantity: item.quantity ?? null,
        unit: item.unit?.toLowerCase() ?? null,
        unit_rate_aed: item.unit_price_aed ?? null,
        total_aed: item.subtotal_aed,
        is_subtotal: false,
        normalized_description: normalizeDescription(item.description),
        scope_item_id: normalizeCategoryName(category.name),
      }))

    if (lineItems.length > 0) {
      const { error: itemError } = await supabase
        .from('historical_line_items')
        .insert(lineItems)

      if (!itemError) totalItems += lineItems.length
    }
  }

  // Refresh materialized view
  // Note: REFRESH MATERIALIZED VIEW must be run via SQL, not through the Supabase client.
  // In production, this would be a Supabase Edge Function or a database trigger.
  // For now, the view will be refreshed on next import script run.

  return NextResponse.json({
    success: true,
    ingested: true,
    project_id: project.id,
    categories_ingested: categories.length,
    items_ingested: totalItems,
  })
}
