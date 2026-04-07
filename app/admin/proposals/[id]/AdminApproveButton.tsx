'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = { proposalId: string }

export default function AdminApproveButton({ proposalId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleApprove() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/admin/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('Failed to approve proposal. Please try again.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="w-full py-3 bg-brand-green text-white font-medium rounded-xl hover:bg-brand-green/90 transition-all disabled:opacity-50 text-sm"
      >
        {loading ? 'Approving...' : 'Approve Proposal'}
      </button>
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
