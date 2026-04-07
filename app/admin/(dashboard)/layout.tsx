import { redirect } from 'next/navigation'
import { verifyAdminReadOnly } from '@/lib/admin/auth'
import { AdminLayoutShell } from '@/components/admin/admin-layout-shell'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await verifyAdminReadOnly()

  if (!auth.admin) {
    redirect('/admin/login')
  }

  return (
    <AdminLayoutShell adminEmail={auth.email} adminRole={auth.role}>
      {children}
    </AdminLayoutShell>
  )
}
