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

  // Filter: only leads with messages or non-zero confidence
  const filtered = (data ?? [])
    .filter((p: any) => {
      const hasMessages = Array.isArray(p.chat_messages) && p.chat_messages.length > 0
      const hasConfidence = p.confidence_score > 0
      return hasMessages || hasConfidence
    })
    .map(({ chat_messages: _, ...lead }: any) => lead)

  return NextResponse.json(filtered)
}
