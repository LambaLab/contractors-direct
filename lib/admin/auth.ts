import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/types'

const SUPER_ADMIN_EMAIL = 'nagi@contractorsdirect.com'

/**
 * Check if an email is an authorized admin.
 * The super admin always passes. Other emails are checked against the admin_users table.
 */
export async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.toLowerCase()
  if (normalized === SUPER_ADMIN_EMAIL) return true

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', normalized)
      .single()

    return !!data
  } catch {
    return false
  }
}

/**
 * Get the admin role for an email. Returns null if not an admin.
 */
export async function getAdminRole(email: string): Promise<'super_admin' | 'admin' | null> {
  const normalized = email.toLowerCase()
  if (normalized === SUPER_ADMIN_EMAIL) return 'super_admin'

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', normalized)
      .single()

    return (data?.role as 'super_admin' | 'admin') ?? null
  } catch {
    return null
  }
}

/**
 * Read-only admin check for use in layouts (cannot set cookies).
 */
export async function verifyAdminReadOnly(): Promise<
  { admin: true; email: string; role: 'super_admin' | 'admin' } | { admin: false; email: null; role: null }
> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() { /* no-op in layouts */ },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) return { admin: false, email: null, role: null }

    const role = await getAdminRole(user.email)
    if (!role) return { admin: false, email: null, role: null }

    return { admin: true, email: user.email, role }
  } catch {
    return { admin: false, email: null, role: null }
  }
}

/**
 * Verify current request is from an authenticated admin.
 * Use in Route Handlers and Server Actions (can set cookies).
 */
export async function verifyAdmin(): Promise<
  { admin: true; email: string; role: 'super_admin' | 'admin' } | { admin: false; email: null; role: null }
> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) return { admin: false, email: null, role: null }

  const role = await getAdminRole(user.email)
  if (!role) return { admin: false, email: null, role: null }

  return { admin: true, email: user.email, role }
}
