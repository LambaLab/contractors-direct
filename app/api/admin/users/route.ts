import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/users — List all admin users (any admin can view)
 */
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load admin users' }, { status: 500 })
  }

  return NextResponse.json({ users: data, currentRole: auth.role })
}

/**
 * POST /api/admin/users — Add a new admin user (super_admin only)
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can add team members' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  const supabase = createServiceClient()

  // Check if already exists
  const { data: existing } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'This email is already an admin' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email: normalizedEmail,
      role: 'admin',
      added_by: auth.email,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to add admin user' }, { status: 500 })
  }

  return NextResponse.json({ user: data })
}
