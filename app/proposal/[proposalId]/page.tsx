import { redirect, notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ proposalId: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { proposalId } = await params
  const { t: token } = await searchParams

  // --- Slug path: resolve directly via Supabase ---
  if (!UUID_RE.test(proposalId)) {
    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('id, slug')
      .eq('slug', proposalId)
      .single()

    if (lead) {
      const tokenParam = token ? `&t=${token}` : ''
      redirect(`/?c=${lead.id}${tokenParam}`)
    }

    // Check slug history for renamed slugs
    const { data: history } = await supabase
      .from('lead_slug_history')
      .select('lead_id')
      .eq('slug', proposalId)
      .single()

    if (history) {
      const { data: target } = await supabase
        .from('leads')
        .select('slug')
        .eq('id', history.lead_id)
        .single()

      if (target?.slug) {
        const tokenParam = token ? `?t=${token}` : ''
        redirect(`/proposal/${target.slug}${tokenParam}`)
      }
    }

    notFound()
  }

  // --- UUID path: show "in review" page ---
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-brand-purple/10 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-3xl">📋</span>
        </div>
        <div className="space-y-2">
          <h1 className="font-heading font-bold text-4xl text-brand-white">YOUR PROPOSAL IS IN REVIEW</h1>
          <p className="text-brand-gray-mid leading-relaxed">
            Our team is reviewing your AI-generated proposal to make sure everything is accurate.
            You&apos;ll receive an email when it&apos;s ready — usually within 24 hours.
          </p>
        </div>
        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-left space-y-2">
          <p className="text-xs text-brand-gray-mid">Proposal ID</p>
          <p className="text-sm font-mono text-brand-white">{proposalId}</p>
        </div>
      </div>
    </div>
  )
}
