import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * DELETE /api/admin/users/[id] — Remove an admin user (super_admin only)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin()
  if (!auth.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can remove team members' }, { status: 403 })
  }

  const { id } = await params

  const supabase = createServiceClient()

  // Prevent deleting the super admin
  const { data: target } = await supabase
    .from('admin_users')
    .select('email, role')
    .eq('id', id)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (target.role === 'super_admin') {
    return NextResponse.json({ error: 'Cannot remove the super admin' }, { status: 403 })
  }

  const { error } = await supabase
    .from('admin_users')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove admin user' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
