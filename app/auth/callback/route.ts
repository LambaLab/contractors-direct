import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const leadId = requestUrl.searchParams.get('leadId')
  const sessionId = requestUrl.searchParams.get('sessionId')

  if (!code || !leadId || !sessionId) {
    console.error('Auth callback: missing params', { code: !!code, leadId, sessionId })
    return NextResponse.redirect(new URL('/?error=auth_failed', requestUrl.origin))
  }

  const supabase = await createServerSupabaseClient()

  // Exchange the PKCE code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('Auth callback: exchange failed', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', requestUrl.origin))
  }

  // Validate lead belongs to this session and link to user
  const serviceClient = createServiceClient()

  const { data: lead } = await serviceClient
    .from('leads')
    .select('id, session_id')
    .eq('id', leadId)
    .eq('session_id', sessionId)
    .single()

  if (!lead) {
    console.error('Auth callback: lead not found or session mismatch')
    return NextResponse.redirect(new URL('/?error=lead_not_found', requestUrl.origin))
  }

  const { error: updateError, count } = await serviceClient
    .from('leads')
    .update({ user_id: data.user.id, status: 'pending_review' }, { count: 'exact' })
    .eq('id', leadId)
    .eq('session_id', sessionId)
    .is('user_id', null)

  if (updateError) {
    console.error('Auth callback: lead update failed', updateError)
    return NextResponse.redirect(new URL('/?error=update_failed', requestUrl.origin))
  }

  if (count === 0) {
    // Lead already claimed
    return NextResponse.redirect(new URL(`/lead/${leadId}?status=pending`, requestUrl.origin))
  }

  return NextResponse.redirect(new URL(`/lead/${leadId}?status=pending`, requestUrl.origin))
}
