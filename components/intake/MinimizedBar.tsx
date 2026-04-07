'use client'

import { ChevronUp } from 'lucide-react'

type Props = {
  appName: string
  confidenceScore: number
  onExpand: () => void
}

export default function MinimizedBar({ appName, confidenceScore, onExpand }: Props) {
  const pct = Math.min(100, Math.max(0, confidenceScore))
  const displayName = appName ? appName.toUpperCase() : 'YOUR PROJECT'
  return (
    <button
      onClick={onExpand}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-[var(--ov-surface,#1a1a1a)] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-2xl shadow-2xl hover:border-brand-purple/30 transition-all w-72"
    >
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-heading font-bold tracking-widest text-[var(--ov-text,#ffffff)]">{displayName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-[var(--ov-text-muted,#727272)] whitespace-nowrap">
            {pct}%
          </p>
          <div className="flex-1 h-1 bg-[var(--ov-track,rgba(255,255,255,0.10))] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-purple rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      <ChevronUp className="w-4 h-4 text-[var(--ov-text-muted,#727272)] flex-shrink-0" />
    </button>
  )
}
