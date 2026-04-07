'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Check, MessageSquare, Phone } from 'lucide-react'

type BudgetProposal = {
  id: string
  lead_id: string
  amount: number
  client_notes: string | null
  status: string
  counter_amount: number | null
  counter_notes: string | null
  created_at: string
  responded_at: string | null
}

export default function BudgetResponsePage() {
  const params = useParams()
  const proposalId = params.proposalId as string

  const [budget, setBudget] = useState<BudgetProposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'accepted' | 'countered' | 'call_requested' | null>(null)
  const [counterAmount, setCounterAmount] = useState('')
  const [counterNotes, setCounterNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('budget_proposals')
        .select('*')
        .eq('lead_id', proposalId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) setBudget(data as BudgetProposal)
      setLoading(false)
    }
    load()
  }, [proposalId])

  async function handleSubmit() {
    if (!action || !budget) return
    setSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      budgetId: budget.id,
      action,
    }

    if (action === 'countered') {
      const amt = parseInt(counterAmount, 10)
      if (!amt || amt <= 0) {
        setError('Please enter a valid counter amount')
        setSubmitting(false)
        return
      }
      body.counterAmount = amt
      body.counterNotes = counterNotes.trim() || null
    }

    if (action === 'call_requested') {
      body.counterNotes = counterNotes.trim() || null
    }

    const res = await fetch(`/api/proposals/${proposalId}/budget-respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
    } else {
      setSubmitted(true)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-purple/30 border-t-brand-yellow rounded-full animate-spin" />
      </div>
    )
  }

  if (!budget) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-brand-white text-lg">No pending budget proposal found.</p>
          <p className="text-sm text-brand-gray-mid">It may have already been responded to.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    const messages: Record<string, { title: string; desc: string }> = {
      accepted: { title: 'Budget accepted!', desc: 'The Contractors Direct team will be in touch to kick off your project.' },
      countered: { title: 'Counter-proposal sent!', desc: 'The Contractors Direct team will review and get back to you.' },
      call_requested: { title: 'Call requested!', desc: 'The Contractors Direct team will reach out to schedule a call.' },
    }
    const msg = messages[action!] ?? messages.accepted

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-brand-green" />
          </div>
          <h1 className="font-heading font-bold text-3xl text-brand-white">{msg.title}</h1>
          <p className="text-sm text-brand-gray-mid">{msg.desc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-heading font-bold text-3xl text-brand-white tracking-wide">CONTRACTORS DIRECT</h1>
          <p className="text-sm text-brand-gray-mid">Budget Proposal</p>
        </div>

        {/* Amount card */}
        <div className="p-8 bg-white/5 border border-white/5 rounded-2xl text-center space-y-4">
          <DollarSign className="w-8 h-8 text-brand-green mx-auto" />
          <p className="text-5xl font-bold text-brand-green font-mono">
            ${budget.amount.toLocaleString()}
          </p>
          {budget.client_notes && (
            <p className="text-sm text-brand-gray-mid leading-relaxed max-w-sm mx-auto">
              {budget.client_notes}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setAction('accepted')}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
              action === 'accepted'
                ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                : 'bg-white/[0.03] border-white/10 text-brand-white hover:border-white/20'
            }`}
          >
            <Check className="w-5 h-5" />
            <div className="text-left">
              <p className="text-sm font-medium">Accept</p>
              <p className="text-xs text-brand-gray-mid">Approve this budget and move forward</p>
            </div>
          </button>

          <button
            onClick={() => setAction('countered')}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
              action === 'countered'
                ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
                : 'bg-white/[0.03] border-white/10 text-brand-white hover:border-white/20'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <div className="text-left">
              <p className="text-sm font-medium">Counter</p>
              <p className="text-xs text-brand-gray-mid">Propose a different amount</p>
            </div>
          </button>

          <button
            onClick={() => setAction('call_requested')}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
              action === 'call_requested'
                ? 'bg-white/10 border-white/20 text-brand-white'
                : 'bg-white/[0.03] border-white/10 text-brand-white hover:border-white/20'
            }`}
          >
            <Phone className="w-5 h-5" />
            <div className="text-left">
              <p className="text-sm font-medium">Request a call</p>
              <p className="text-xs text-brand-gray-mid">Discuss the budget in person</p>
            </div>
          </button>
        </div>

        {/* Counter amount input */}
        {action === 'countered' && (
          <div className="space-y-3 animate-in">
            <div>
              <label className="block text-xs text-brand-gray-mid mb-1.5">Your proposed amount (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-mid" />
                <input
                  type="number"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  placeholder="10000"
                  min="1"
                  autoFocus
                  className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-white outline-none focus:border-brand-blue/40 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-brand-gray-mid mb-1.5">Note (optional)</label>
              <textarea
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                placeholder="Why this amount works better for you..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-white outline-none focus:border-brand-blue/40 transition-colors min-h-[80px] resize-y placeholder-brand-gray-mid/50"
              />
            </div>
          </div>
        )}

        {/* Call request note */}
        {action === 'call_requested' && (
          <div className="space-y-3 animate-in">
            <div>
              <label className="block text-xs text-brand-gray-mid mb-1.5">Any preferences or notes? (optional)</label>
              <textarea
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                placeholder="Best times to reach you, topics to discuss..."
                autoFocus
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-white outline-none focus:border-white/30 transition-colors min-h-[80px] resize-y placeholder-brand-gray-mid/50"
              />
            </div>
          </div>
        )}

        {/* Submit */}
        {action && (
          <div className="space-y-2">
            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 bg-brand-purple text-white font-medium rounded-xl hover:bg-brand-purple/90 transition-all disabled:opacity-50 text-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : action === 'accepted' ? 'Accept Budget' : action === 'countered' ? 'Send Counter-Proposal' : 'Request a Call'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
