import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/price-book
 * Returns all unique historical line items aggregated with pricing stats,
 * plus any CD team overrides.
 */
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  // Fetch pricing summary (materialized view) and overrides in parallel
  const [summaryResult, overridesResult, projectCountResult] = await Promise.all([
    supabase
      .from('pricing_summary' as 'historical_projects')
      .select('*'),
    supabase
      .from('pricing_overrides')
      .select('*')
      .order('item_description'),
    supabase
      .from('historical_projects')
      .select('id', { count: 'exact', head: true })
      .eq('is_latest_revision', true),
  ])

  // Also fetch sample line items grouped by scope_item_id to get representative descriptions
  const { data: sampleItems } = await supabase
    .from('historical_line_items')
    .select('scope_item_id, description, unit, unit_rate_aed, historical_projects!historical_line_items_project_id_fkey(project_name)')
    .eq('is_subtotal', false)
    .gt('unit_rate_aed', 0)
    .order('created_at', { ascending: false })
    .limit(500)

  return NextResponse.json({
    summary: summaryResult.data ?? [],
    overrides: overridesResult.data ?? [],
    sampleItems: sampleItems ?? [],
    projectCount: projectCountResult.count ?? 0,
  })
}

/**
 * PATCH /api/admin/price-book
 * Create or update a pricing override.
 */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { item_description, unit, scope_item_id, override_min_aed, override_max_aed, notes } = body

  if (!item_description || !unit || override_min_aed == null || override_max_aed == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (override_min_aed < 0 || override_max_aed < 0 || override_min_aed > override_max_aed) {
    return NextResponse.json({ error: 'Invalid price range' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Upsert by (item_description, unit) unique constraint
  const adminId = (auth.admin as unknown as { id: string }).id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pricing_overrides')
    .upsert(
      {
        item_description,
        unit,
        scope_item_id: scope_item_id ?? null,
        override_min_aed,
        override_max_aed,
        notes: notes ?? null,
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'item_description,unit' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * DELETE /api/admin/price-book
 * Remove a pricing override (reverts to historical data).
 */
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing override id' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('pricing_overrides')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
