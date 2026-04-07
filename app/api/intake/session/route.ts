import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // Use the service client for everything — this avoids overwriting the
  // browser's auth cookies (which would sign out an admin testing in the
  // same browser).
  const supabase = createServiceClient()

  // Generate a deterministic UUID for anonymous users instead of using
  // Supabase Auth admin API (which can hit rate limits / user caps on free tier).
  // We create the auth user first, then the session and lead.
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email_confirm: true,
    user_metadata: { anonymous: true },
  })

  if (authError || !authData.user) {
    // Log the actual error for debugging (visible in Vercel function logs)
    console.error('[session] auth.admin.createUser failed:', authError?.message ?? 'no user returned', authError?.status)

    // Fallback: create session + lead WITHOUT an auth user.
    // Both intake_sessions.user_id and leads.user_id are nullable,
    // so this bypasses the auth.users FK constraint.
    return createSessionAndLead(supabase, null, req)
  }

  return createSessionAndLead(supabase, authData.user.id, req)
}

async function createSessionAndLead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  req: NextRequest
) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const email = typeof body.email === 'string' && body.email ? body.email : null

  // Create session row (service client bypasses RLS)
  const { data: session, error: sessionError } = await supabase
    .from('intake_sessions')
    .insert(userId ? { user_id: userId } : {})
    .select()
    .single()

  if (sessionError || !session) {
    console.error('[session] intake_sessions.insert failed:', sessionError?.message, sessionError?.code)
    return NextResponse.json(
      { error: 'Failed to create session record', detail: sessionError?.message },
      { status: 500 }
    )
  }

  // Create initial lead for this session
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      session_id: (session as { id: string }).id,
      ...(userId ? { user_id: userId } : {}),
      ...(email ? { email } : {}),
    })
    .select()
    .single()

  if (leadError || !lead) {
    console.error('[session] leads.insert failed:', leadError?.message, leadError?.code)
    return NextResponse.json(
      { error: 'Failed to create lead', detail: leadError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    sessionId: session.id,
    leadId: lead.id,
    userId: userId ?? session.id, // fallback: use session ID as pseudo-userId for client storage
  })
}
