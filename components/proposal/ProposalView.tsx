'use client'

import { useState } from 'react'
import type { Database } from '@/lib/supabase/types'

type Proposal = Database['public']['Tables']['leads']['Row']
type Props = { proposal: Proposal }

export default function ProposalView({ proposal }: Props) {
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  async function handleAccept() {
    setAccepting(true)
    setAcceptError(null)
    const res = await fetch(`/api/proposals/${proposal.id}/accept`, { method: 'POST' })
    if (res.ok) {
      setAccepted(true)
    } else {
      setAcceptError('Failed to accept proposal. Please try again or contact us.')
    }
    setAccepting(false)
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-brand-green/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-brand-green text-2xl">&#10003;</span>
          </div>
          <h1 className="font-bebas text-4xl text-brand-white">PROPOSAL ACCEPTED!</h1>
          <p className="text-brand-gray-mid">We&apos;ll be in touch shortly to kick off your project.</p>
        </div>
      </div>
    )
  }

  const scope = proposal.scope as string[]
  const taskBreakdown = proposal.task_breakdown as Array<{ module: string; tasks: Array<{ name: string; complexity: string; description: string }> }> | null
  const milestones = proposal.milestone_plan as Array<{ name: string; week: number; deliverables: string[] }> | null

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 bg-brand-green/10 border border-brand-green/20 rounded-full px-3 py-1 text-xs text-brand-green">
          &#10003; Reviewed by Contractors Direct team
        </div>
        <h1 className="font-bebas text-5xl md:text-6xl text-brand-white">YOUR PROJECT PROPOSAL</h1>
        <p className="text-brand-gray-mid">{proposal.brief}</p>

        <div className="flex items-center gap-6 p-4 bg-white/5 border border-white/5 rounded-xl">
          <div>
            <p className="text-xs text-brand-gray-mid">Estimated cost</p>
            <p className="font-bebas text-3xl text-brand-yellow">
              ${proposal.price_min.toLocaleString()}&ndash;${proposal.price_max.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-gray-mid">Scope</p>
            <p className="font-bold text-brand-white">{scope.length}</p>
          </div>
        </div>
      </div>

      {proposal.prd && (
        <section className="space-y-4">
          <h2 className="font-bebas text-3xl text-brand-white">PRODUCT REQUIREMENTS</h2>
          <div className="text-sm text-brand-gray-mid leading-relaxed whitespace-pre-wrap">
            {proposal.prd}
          </div>
        </section>
      )}

      {proposal.technical_architecture && (
        <section className="space-y-4">
          <h2 className="font-bebas text-3xl text-brand-white">TECHNICAL ARCHITECTURE</h2>
          <div className="text-sm text-brand-gray-mid leading-relaxed whitespace-pre-wrap">
            {proposal.technical_architecture}
          </div>
        </section>
      )}

      {taskBreakdown && taskBreakdown.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-bebas text-3xl text-brand-white">TASK BREAKDOWN</h2>
          <div className="space-y-4">
            {taskBreakdown.map((group, i) => (
              <div key={i} className="space-y-2">
                <h3 className="text-sm font-bold text-brand-white capitalize">{group.module}</h3>
                {group.tasks.map((task, j) => (
                  <div key={j} className="flex items-start gap-3 p-3 bg-white/5 border border-white/5 rounded-lg">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                      task.complexity === 'L' ? 'bg-red-500/10 text-red-400' :
                      task.complexity === 'M' ? 'bg-brand-yellow/10 text-brand-yellow' :
                      'bg-brand-green/10 text-brand-green'
                    }`}>{task.complexity}</span>
                    <div>
                      <p className="text-sm text-brand-white">{task.name}</p>
                      <p className="text-xs text-brand-gray-mid mt-0.5">{task.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {proposal.timeline && (
        <section className="space-y-4">
          <h2 className="font-bebas text-3xl text-brand-white">TIMELINE</h2>
          <div className="text-sm text-brand-gray-mid leading-relaxed whitespace-pre-wrap">
            {proposal.timeline}
          </div>
        </section>
      )}

      {milestones && milestones.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-bebas text-3xl text-brand-white">MILESTONE PLAN</h2>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-brand-white">{m.name}</h3>
                  <span className="text-xs text-brand-gray-mid">Week {m.week}</span>
                </div>
                <ul className="space-y-1">
                  {m.deliverables.map((d, j) => (
                    <li key={j} className="text-sm text-brand-gray-mid flex items-start gap-2">
                      <span className="text-brand-yellow mt-0.5">&middot;</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="sticky bottom-6">
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full py-4 bg-brand-yellow text-brand-dark font-bold rounded-xl hover:bg-brand-yellow/90 transition-all active:scale-[0.98] text-base disabled:opacity-50"
        >
          {accepting ? 'Processing...' : 'Accept Proposal & Start Project \u2192'}
        </button>
        {acceptError && (
          <p className="text-center text-xs text-red-400 mt-2">{acceptError}</p>
        )}
        {!acceptError && (
          <p className="text-center text-xs text-brand-gray-mid mt-2">
            By accepting, you agree to begin the project under these terms
          </p>
        )}
      </div>
    </div>
  )
}
