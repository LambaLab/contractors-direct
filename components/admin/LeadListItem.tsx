'use client'

import type { Database } from '@/lib/supabase/types'

type Lead = Database['public']['Tables']['leads']['Row']

type Props = {
  lead: Lead
  isSelected: boolean
  onClick: () => void
  isFullWidth?: boolean
}

function getStatusStyle(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'draft':
    case 'saved':
      return { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' }
    case 'pending_review':
      return { bg: 'bg-purple-950 dark:bg-purple-9500/10', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-9500' }
    case 'approved':
      return { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' }
    case 'budget_proposed':
      return { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' }
    case 'accepted':
    case 'budget_accepted':
      return { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400', dot: 'bg-violet-500' }
    default:
      return { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' }
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function getProjectName(lead: Lead): string {
  const meta = lead.metadata as Record<string, unknown> | null
  if (meta?.projectName && typeof meta.projectName === 'string') return meta.projectName
  if (lead.brief) return lead.brief.slice(0, 40) + (lead.brief.length > 40 ? '...' : '')
  return 'Untitled'
}

function getConfidenceColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 50) return 'text-purple-600 dark:text-purple-400'
  return 'text-zinc-500 dark:text-zinc-400'
}

export default function LeadListItem({ lead, isSelected, onClick, isFullWidth }: Props) {
  const status = getStatusStyle(lead.status)
  const statusLabel = lead.status.replace(/_/g, ' ')

  // Full-width single-line layout (desktop, no lead selected)
  if (isFullWidth) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left px-4 lg:px-6 py-3 border-b transition-colors cursor-pointer group ${
          isSelected
            ? 'bg-purple-950/80 dark:bg-purple-9500/5 border-l-2 border-l-purple-9500'
            : 'hover:bg-muted/50 border-l-2 border-l-transparent'
        }`}
      >
        <div className="flex items-center gap-4">
          {/* Name */}
          <p className={`text-sm truncate w-[220px] shrink-0 ${
            isSelected ? 'font-bold text-foreground' : 'font-semibold text-foreground'
          }`}>
            {getProjectName(lead)}
          </p>

          {/* Email */}
          <span className="text-xs text-muted-foreground truncate w-[200px] shrink-0">
            {lead.email ?? 'No email'}
          </span>

          {/* Spacer */}
          <span className="flex-1" />

          {/* Confidence */}
          <span className={`text-xs font-medium tabular-nums shrink-0 ${getConfidenceColor(lead.confidence_score)}`}>
            {lead.confidence_score}%
          </span>

          {/* Price */}
          {lead.price_min > 0 ? (
            <span className="text-xs font-medium text-foreground tabular-nums shrink-0 w-[80px] text-right">
              ${lead.price_min.toLocaleString()}
            </span>
          ) : (
            <span className="w-[80px] shrink-0" />
          )}

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide w-[100px] justify-center ${status.bg} ${status.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {statusLabel}
          </span>

          {/* Time */}
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 w-[60px] text-right tabular-nums">
            {timeAgo(lead.created_at)}
          </span>
        </div>
      </button>
    )
  }

  // Compact 2-line layout (split panel or mobile)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 md:py-3 border-b transition-colors cursor-pointer group ${
        isSelected
          ? 'bg-purple-950/80 dark:bg-purple-9500/5 border-l-2 border-l-purple-9500'
          : 'hover:bg-muted/50 border-l-2 border-l-transparent'
      }`}
    >
      {/* Line 1: Project name + status badge */}
      <div className="flex items-center gap-2 mb-1">
        <p className={`text-base md:text-sm truncate flex-1 ${
          isSelected ? 'font-bold text-foreground' : 'font-semibold text-foreground'
        }`}>
          {getProjectName(lead)}
        </p>

        <span className={`inline-flex items-center gap-1 text-[11px] md:text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide ${status.bg} ${status.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {statusLabel}
        </span>
      </div>

      {/* Line 2: Email + confidence + price + time */}
      <div className="flex items-center gap-2 text-sm md:text-xs">
        <span className="text-muted-foreground truncate flex-1">
          {lead.email ?? 'No email'}
        </span>

        <span className={`font-medium tabular-nums ${getConfidenceColor(lead.confidence_score)}`}>
          {lead.confidence_score}%
        </span>

        {lead.price_min > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-medium text-foreground tabular-nums">
              ${lead.price_min.toLocaleString()}
            </span>
          </>
        )}

        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground whitespace-nowrap text-xs md:text-[11px]">
          {timeAgo(lead.created_at)}
        </span>
      </div>
    </button>
  )
}
