'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Send, Clock, Check, MessageSquare, Phone } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type BudgetLead = Database['public']['Tables']['budget_proposals']['Row']

type Props = {
  leadId: string
  leadEmail: string | null
  leadSlug: string | null
}

const STATUS_ICONS: Record<string, typeof Check> = {
  pending: Clock,
  accepted: Check,
  countered: MessageSquare,
  call_requested: Phone,
}

export default function BudgetTab({ leadId, leadEmail, leadSlug }: Props) {
  const [budgets, setBudgets] = useState<BudgetLead[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = supabaseRef.current

    async function loadBudgets() {
      const { data } = await supabase
        .from('budget_proposals')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })

      if (data) setBudgets(data)
      setLoading(false)
    }

    loadBudgets()

    // Realtime updates (optional, degrades gracefully if not enabled)
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel(`budget:${leadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'budget_proposals',
            filter: `lead_id=eq.${leadId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setBudgets((prev) => [...prev, payload.new as BudgetLead])
            } else if (payload.eventType === 'UPDATE') {
              setBudgets((prev) =>
                prev.map((b) => (b.id === (payload.new as BudgetLead).id ? payload.new as BudgetLead : b))
              )
            }
          }
        )
        .subscribe()
    } catch {
      // Realtime not configured yet, polling fallback
    }

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [leadId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNum = parseInt(amount, 10)
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setSending(true)
    setError(null)

    const res = await fetch('/api/admin/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        amount: amountNum,
        clientNotes: clientNotes.trim() || null,
        internalNotes: internalNotes.trim() || null,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to send budget proposal')
    } else {
      setAmount('')
      setClientNotes('')
      setInternalNotes('')
    }
    setSending(false)
  }

  function statusBadge(status: string) {
    const Icon = STATUS_ICONS[status] ?? Clock
    const label = status.replace(/_/g, ' ')

    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400 gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Badge>
        )
      case 'accepted':
        return (
          <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Badge>
        )
      case 'countered':
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Badge>
        )
      case 'call_requested':
        return (
          <Badge variant="secondary" className="gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Budget history */}
      {budgets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Budget history</h3>
          <div className="space-y-2">
            {budgets.map((budget) => (
              <Card key={budget.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-green-500" />
                      <span className="text-lg font-bold text-foreground">
                        ${budget.amount.toLocaleString()}
                      </span>
                    </div>
                    {statusBadge(budget.status)}
                  </div>

                  {budget.client_notes && (
                    <p className="text-sm text-muted-foreground">{budget.client_notes}</p>
                  )}

                  {budget.internal_notes && (
                    <p className="text-xs text-purple-500/60 italic">Internal: {budget.internal_notes}</p>
                  )}

                  {budget.status === 'countered' && budget.counter_amount && (
                    <Card className="border-blue-500/10 bg-blue-500/5">
                      <CardContent className="p-3">
                        <p className="text-xs text-blue-500 mb-1">Counter-offer</p>
                        <p className="text-sm font-bold text-foreground">${budget.counter_amount.toLocaleString()}</p>
                        {budget.counter_notes && (
                          <p className="text-xs text-muted-foreground mt-1">{budget.counter_notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {budget.status === 'call_requested' && budget.counter_notes && (
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground mb-1">Call request note</p>
                        <p className="text-sm text-foreground">{budget.counter_notes}</p>
                      </CardContent>
                    </Card>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    {new Date(budget.created_at).toLocaleString()}
                    {budget.responded_at && ` · Responded ${new Date(budget.responded_at).toLocaleString()}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* New budget proposal form */}
      <div className="space-y-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
          {budgets.length > 0 ? 'Send new budget' : 'Propose a budget'}
        </h3>

        {!leadEmail && (
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="p-3 text-xs text-purple-500">
              No email on file. The client won't receive an email notification.
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Amount (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12000"
                min="1"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes to client (optional)</Label>
            <Textarea
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Here's why we think this is fair..."
              className="min-h-[80px] resize-y"
            />
          </div>

          <div className="space-y-1">
            <Label>Internal notes (admin only)</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Pricing rationale, margin notes..."
              className="min-h-[60px] resize-y border-primary/20"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={sending || !amount}>
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Budget Proposal'}
          </Button>
        </form>
      </div>
    </div>
  )
}
