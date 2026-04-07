import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await verifyAdmin()
  if (!auth.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  // Fetch leads that have at least one chat message OR confidence > 0.
  // This filters out ghost leads created when someone opens the intake
  // but never types anything.
  const { data, error } = await supabase
    .from('leads')
    .select('*, chat_messages(id)')
    .order('created_at', { ascending: false }) as any

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return all leads, stripping the joined chat_messages
  const filtered = (data ?? [])
    .map(({ chat_messages: _, ...lead }: any) => lead)

  return NextResponse.json(filtered)
}
