import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (lead) {
    return NextResponse.json({ proposalId: lead.id, slug: lead.slug })
  }

  const { data: history } = await supabase
    .from('lead_slug_history')
    .select('lead_id')
    .eq('slug', slug)
    .single()

  if (history) {
    const { data: target } = await supabase
      .from('leads')
      .select('slug')
      .eq('id', history.lead_id)
      .single()

    return NextResponse.json({
      redirect: true,
      proposalId: history.lead_id,
      currentSlug: target?.slug ?? null,
    })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
