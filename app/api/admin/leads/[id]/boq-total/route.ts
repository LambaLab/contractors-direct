import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

type BoqLineItem = { subtotal_aed?: number | null }
type BoqCategory = { line_items?: BoqLineItem[] | null }

/**
 * GET /api/admin/leads/[id]/boq-total
 *
 * Returns the latest BOQ draft's grand total for the lead, plus a derived
 * line-item count so the admin estimate panel can show "X line items".
 * Returns 200 with `{ exists: false }` when no BOQ draft has been generated.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('boq_drafts')
    .select('id, grand_total_aed, categories, locked, updated_at, version')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ exists: false })

  const cats = (data.categories as BoqCategory[] | null) ?? []
  const lineCount = cats.reduce(
    (sum, c) => sum + ((c.line_items?.length ?? 0) | 0),
    0,
  )

  return NextResponse.json({
    exists: true,
    boqId: data.id,
    grandTotalAed: Number(data.grand_total_aed) || 0,
    lineCount,
    locked: !!data.locked,
    version: data.version,
    updatedAt: data.updated_at,
  })
}
