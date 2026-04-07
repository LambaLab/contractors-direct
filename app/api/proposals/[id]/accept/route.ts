import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('leads')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Lead not found or not eligible' }, { status: 404 })

  return NextResponse.json({ success: true })
}
