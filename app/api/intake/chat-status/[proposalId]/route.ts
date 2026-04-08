import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Lightweight polling endpoint for the intake client.
 * Returns admin active status and any new admin chat messages since `after` timestamp.
 * No auth required (anonymous intake users call this).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await params
  const after = req.nextUrl.searchParams.get('after')
  const supabase = createServiceClient()

  // Get admin_active from leads metadata
  const { data: lead } = await supabase
    .from('leads')
    .select('metadata')
    .eq('id', proposalId)
    .single()

  const metadata = lead?.metadata as Record<string, unknown> | null
  const adminActive = metadata?.admin_active === true

  // Get new admin messages since timestamp
  let query = supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('lead_id', proposalId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })

  if (after) {
    query = query.gt('created_at', after)
  }

  const { data: messages } = await query

  return NextResponse.json({
    adminActive,
    messages: messages ?? [],
  })
}
