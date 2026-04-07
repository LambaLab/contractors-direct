import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/auth'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email || !(await isAdminEmail(email))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const supabase = await createServerSupabaseClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/admin/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
