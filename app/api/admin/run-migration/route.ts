import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/run-migration
 * Run the historical BOQ migration via individual Supabase operations.
 * This is a one-time setup endpoint.
 */
export async function POST() {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any
  const results: { step: string; ok: boolean; error?: string }[] = []

  // Test if tables already exist by trying a select
  const { error: testError } = await supabase.from('historical_projects').select('id').limit(1)
  if (!testError) {
    return NextResponse.json({ message: 'Migration already applied - tables exist', results: [] })
  }

  // Unfortunately, Supabase JS client cannot run DDL (CREATE TABLE).
  // The migration must be run via Supabase Dashboard SQL Editor.
  // This endpoint returns the SQL to run.
  return NextResponse.json({
    message: 'Run this SQL in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/iaunsegevlifegcowwdz/sql/new)',
    note: 'Copy the SQL from supabase/migrations/20260411000000_historical_boq.sql and paste it into the SQL Editor, then click Run.',
  })
}
