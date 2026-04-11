export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import AdminApproveButton from './AdminApproveButton'

export default async function AdminProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = await (supabase as any)
    .from('proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (!proposal) notFound()

  const modules = (proposal.modules ?? []) as string[]

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/admin/proposals" className="text-brand-gray-mid hover:text-brand-white text-sm transition-colors">
          ← Back to queue
        </Link>
        <span className={`text-xs px-3 py-1.5 rounded-full ${
          proposal.status === 'pending_review' ? 'bg-brand-purple/10 text-brand-purple' :
          proposal.status === 'approved' ? 'bg-brand-green/10 text-brand-green' :
          'bg-white/5 text-brand-gray-mid'
        }`}>
          {proposal.status.replace('_', ' ')}
        </span>
      </div>

      <div>
        <h1 className="font-heading font-bold text-4xl text-brand-white mb-2">PROPOSAL REVIEW</h1>
        <p className="text-brand-gray-mid">{proposal.brief || 'No brief'}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
          <p className="text-xs text-brand-gray-mid mb-1">Confidence</p>
          <p className="font-bold text-brand-white">{proposal.confidence_score}%</p>
        </div>
        <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
          <p className="text-xs text-brand-gray-mid mb-1">Price range</p>
          <p className="font-bold text-brand-white">${proposal.price_min.toLocaleString()}–${proposal.price_max.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
          <p className="text-xs text-brand-gray-mid mb-1">Modules</p>
          <p className="font-bold text-brand-white">{modules.length}</p>
        </div>
      </div>

      {proposal.prd && (
        <section className="space-y-3">
          <h2 className="font-heading font-bold text-2xl text-brand-white">PRD</h2>
          <div className="text-sm text-brand-gray-mid leading-relaxed whitespace-pre-wrap bg-white/5 border border-white/5 rounded-xl p-4">
            {proposal.prd}
          </div>
        </section>
      )}

      {proposal.status === 'pending_review' && (
        <div className="sticky bottom-6">
          <AdminApproveButton proposalId={id} />
        </div>
      )}
    </div>
  )
}
