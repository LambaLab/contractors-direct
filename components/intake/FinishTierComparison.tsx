'use client'

import { FINISH_LABELS, FINISH_ORDER } from '@/lib/estimator/rates'
import type { FinishLevel } from '@/lib/estimator/types'

function fmt(n: number): string {
  if (!n || !isFinite(n)) return '0'
  return n.toLocaleString('en-AE', { maximumFractionDigits: 0 })
}

type Theme = {
  // Wrapper grid (gap, columns)
  gridClass?: string
  // Tile base (always applied)
  tileBaseClass: string
  // Tile when active
  tileActiveClass: string
  // Tile when inactive
  tileInactiveClass: string
  // Tier label (small uppercase)
  labelClass: string
  // Numeric price
  priceClass: string
  // "AED" prefix
  aedClass: string
}

const THEMES: Record<'intake' | 'admin', Theme> = {
  intake: {
    gridClass: 'grid grid-cols-4 gap-1.5',
    tileBaseClass:
      'flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer',
    tileActiveClass:
      'bg-[rgba(115,103,255,0.14)] border-[rgba(115,103,255,0.45)] text-white',
    tileInactiveClass:
      'border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.7)] hover:border-[rgba(115,103,255,0.3)] hover:text-white',
    labelClass: 'text-[10px] uppercase tracking-widest opacity-70',
    priceClass: 'text-xs sm:text-sm font-mono tabular-nums whitespace-nowrap',
    aedClass: 'text-[10px] text-[#7367ff]/80 mr-1',
  },
  admin: {
    gridClass: 'grid grid-cols-4 gap-2',
    tileBaseClass:
      'flex flex-col items-start gap-1 px-3 py-2.5 rounded-md border text-left transition-colors cursor-pointer',
    tileActiveClass:
      'bg-primary/10 border-primary/40 text-foreground',
    tileInactiveClass:
      'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
    labelClass: 'text-[10px] uppercase tracking-widest opacity-80',
    priceClass: 'text-sm font-mono tabular-nums whitespace-nowrap',
    aedClass: 'text-[10px] text-primary/70 mr-1',
  },
}

export type FinishTierComparisonProps = {
  tiers: Record<FinishLevel, number>
  active: FinishLevel
  onSelect: (tier: FinishLevel) => void
  theme?: 'intake' | 'admin'
}

export default function FinishTierComparison({
  tiers,
  active,
  onSelect,
  theme = 'intake',
}: FinishTierComparisonProps) {
  const t = THEMES[theme]

  return (
    <div className={t.gridClass}>
      {FINISH_ORDER.map((tier) => {
        const isActive = tier === active
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onSelect(tier)}
            className={`${t.tileBaseClass} ${isActive ? t.tileActiveClass : t.tileInactiveClass}`}
          >
            <span className={t.labelClass}>{FINISH_LABELS[tier]}</span>
            <span className={t.priceClass}>
              <span className={t.aedClass}>AED</span>
              {fmt(tiers[tier])}
            </span>
          </button>
        )
      })}
    </div>
  )
}
