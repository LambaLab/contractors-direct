import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/admin/login?error=missing_code', requestUrl.origin))
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user?.email || !(await isAdminEmail(data.user.email))) {
    return NextResponse.redirect(new URL('/admin/login?error=access_denied', requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/admin', requestUrl.origin))
}
