'use client'

import { useMemo } from 'react'
import type { Database } from '@/lib/supabase/types'
import LeadListItem from './LeadListItem'

type Lead = Database['public']['Tables']['leads']['Row']
type SortKey = 'newest' | 'oldest' | 'confidence' | 'price'
type StatusFilter = 'all' | Lead['status']

type Props = {
  leads: Lead[]
  selectedId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  statusFilter: StatusFilter
  sortKey: SortKey
  hideZeroConfidence?: boolean
  isFullWidth?: boolean
}

export default function LeadList({ leads, selectedId, onSelect, searchQuery, statusFilter, sortKey, hideZeroConfidence, isFullWidth }: Props) {
  const filtered = useMemo(() => {
    let result = [...leads]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => {
        const meta = p.metadata as Record<string, unknown> | null
        const projectName = (meta?.projectName as string) ?? ''
        return (
          projectName.toLowerCase().includes(q) ||
          (p.brief ?? '').toLowerCase().includes(q) ||
          (p.email ?? '').toLowerCase().includes(q)
        )
      })
    }

    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter)
    }

    if (hideZeroConfidence) {
      result = result.filter((p) => p.confidence_score > 0)
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'confidence':
          return b.confidence_score - a.confidence_score
        case 'price':
          return b.price_max - a.price_max
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return result
  }, [leads, searchQuery, statusFilter, sortKey, hideZeroConfidence])

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No leads found.</p>
  }

  return (
    <div>
      {filtered.map((p) => (
        <LeadListItem
          key={p.id}
          lead={p}
          isSelected={selectedId === p.id}
          onClick={() => onSelect(p.id)}
          isFullWidth={isFullWidth}
        />
      ))}
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
