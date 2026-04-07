import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const { name } = await req.json()

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let slug = slugify(name)

  if (!slug) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
  }

  const { data: current } = await supabase
    .from('leads')
    .select('slug')
    .eq('id', leadId)
    .single()

  if (current?.slug === slug) {
    return NextResponse.json({ slug })
  }

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('slug', slug)
    .neq('id', leadId)
    .limit(1)
    .single()

  if (existing) {
    slug = `${slug}-${leadId.slice(0, 4)}`
  }

  const { data: historyHit } = await supabase
    .from('lead_slug_history')
    .select('slug')
    .eq('slug', slug)
    .limit(1)
    .single()

  if (historyHit) {
    slug = `${slug}-${leadId.slice(0, 4)}`
  }

  if (current?.slug && current.slug !== slug) {
    await supabase
      .from('lead_slug_history')
      .upsert({ slug: current.slug, lead_id: leadId }, { onConflict: 'slug' })
  }

  const { error } = await supabase
    .from('leads')
    .update({ slug })
    .eq('id', leadId)

  if (error) {
    console.error('[slug] update error:', error)
    return NextResponse.json({ error: 'Failed to update slug' }, { status: 500 })
  }

  return NextResponse.json({ slug })
}
