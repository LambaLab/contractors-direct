export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ProposalView from '@/components/proposal/ProposalView'

export default async function ApprovedProposalPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params
  const supabase = await createServiceClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (!lead) notFound()
  if (lead.status !== 'approved' && lead.status !== 'accepted') {
    redirect(`/proposal/${proposalId}`)
  }

  return <ProposalView proposal={lead} />
}
