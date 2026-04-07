import { redirect, notFound } from 'next/navigation'

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

  // --- Slug path: resolve via API and redirect ---
  if (!UUID_RE.test(proposalId)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${appUrl}/api/proposals/by-slug/${proposalId}`, {
      cache: 'no-store',
    })

    if (!res.ok) notFound()

    const data = await res.json()

    if (data.redirect && data.currentSlug) {
      // Pass through the auth token if present
      const tokenParam = token ? `?t=${token}` : ''
      redirect(`/proposal/${data.currentSlug}${tokenParam}`)
    }

    // Pass through the auth token so the landing page can auto-authenticate
    const tokenParam = token ? `&t=${token}` : ''
    redirect(`/?c=${data.proposalId}${tokenParam}`)
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
