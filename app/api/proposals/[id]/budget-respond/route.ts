import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildBudgetResponseEmail } from '@/lib/email/templates/budget-response'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { budgetId, action, counterAmount, counterNotes } = await req.json()

  if (!budgetId || !action) {
    return NextResponse.json({ error: 'Missing budgetId or action' }, { status: 400 })
  }

  const validActions = ['accepted', 'countered', 'call_requested']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify the budget belongs to this lead
  const { data: budget } = await supabase
    .from('budget_proposals')
    .select('*')
    .eq('id', budgetId)
    .eq('lead_id', leadId)
    .single()

  if (!budget) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
  }

  if (budget.status !== 'pending') {
    return NextResponse.json({ error: 'Budget already responded to' }, { status: 400 })
  }

  // Update budget proposal
  const updateData: Record<string, unknown> = {
    status: action,
    responded_at: new Date().toISOString(),
  }

  if (action === 'countered' && counterAmount) {
    updateData.counter_amount = counterAmount
    updateData.counter_notes = counterNotes ?? null
  }

  if (action === 'call_requested') {
    updateData.counter_notes = counterNotes ?? null
  }

  const { data: updated, error } = await supabase
    .from('budget_proposals')
    .update(updateData as any)
    .eq('id', budgetId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update lead status if accepted
  if (action === 'accepted') {
    await supabase
      .from('leads')
      .update({ status: 'budget_accepted' })
      .eq('id', leadId)
  }

  // Notify admin via email
  const { data: lead } = await supabase
    .from('leads')
    .select('email, metadata')
    .eq('id', leadId)
    .single()

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  const meta = (lead?.metadata ?? {}) as Record<string, unknown>
  const projectName = (meta.projectName as string) ?? 'Project'

  if (adminEmails.length > 0) {
    const { subject, html } = buildBudgetResponseEmail({
      projectName,
      status: action,
      amount: budget.amount,
      counterAmount,
      counterNotes,
      clientEmail: lead?.email ?? 'Unknown',
    })

    for (const adminEmail of adminEmails) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: adminEmail,
        subject,
        html,
      })
    }
  }

  return NextResponse.json(updated)
}
