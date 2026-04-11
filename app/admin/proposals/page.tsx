export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminProposalsPage() {
  const supabase = await createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposals } = await (supabase as any)
    .from('proposals')
    .select('id, status, brief, price_min, price_max, confidence_score, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <h1 className="font-heading font-bold text-4xl text-brand-white mb-8">PROPOSAL QUEUE</h1>

      <div className="space-y-3">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(proposals ?? []).map((p: any) => (
          <Link
            key={p.id}
            href={`/admin/proposals/${p.id}`}
            className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl hover:border-brand-purple/30 transition-colors"
          >
            <div className="space-y-1">
              <p className="text-sm text-brand-white line-clamp-1">{p.brief || 'No brief yet'}</p>
              <p className="text-xs text-brand-gray-mid">
                {new Date(p.created_at).toLocaleDateString()} · {p.confidence_score}% confidence
              </p>
            </div>
            <div className="text-right space-y-1">
              <span className={`text-xs px-2 py-1 rounded-full ${
                p.status === 'pending_review' ? 'bg-brand-purple/10 text-brand-purple' :
                p.status === 'approved' ? 'bg-brand-green/10 text-brand-green' :
                'bg-white/5 text-brand-gray-mid'
              }`}>
                {p.status.replace('_', ' ')}
              </span>
              {p.price_min > 0 && (
                <p className="text-sm font-bold text-brand-white">
                  ${p.price_min.toLocaleString()}–${p.price_max.toLocaleString()}
                </p>
              )}
            </div>
          </Link>
        ))}
        {(proposals ?? []).length === 0 && (
          <p className="text-brand-gray-mid text-sm">No proposals yet.</p>
        )}
      </div>
    </div>
  )
}
