import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { findSimilarHistoricalItems } from '@/lib/pricing/historical'

/**
 * GET /api/admin/historical/similar?description=...&unit=...&scopeItemId=...
 * Returns similar historical line items for comparison in the admin BOQ view.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const description = searchParams.get('description') ?? ''
  const unit = searchParams.get('unit') ?? undefined
  const scopeItemId = searchParams.get('scopeItemId') ?? undefined

  const items = await findSimilarHistoricalItems({
    description,
    unit,
    scopeItemId,
    limit: 10,
  })

  return NextResponse.json({ items })
}
