'use client'

import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import { formatPriceRange, type PriceRange } from '@/lib/pricing/engine'

type Props = {
  range: PriceRange
  scopeIds: string[]
  propertyType: string
  location: string
  sizeSqft: number
  condition: string
  onDigDeeper: () => void
  onSaveLater: () => void
  isLast: boolean
  isStreaming: boolean
}

function conditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    new: 'New',
    needs_refresh: 'Needs refresh',
    major_renovation: 'Major renovation',
    shell: 'Shell',
    fitted: 'Fitted',
    semi_fitted: 'Semi-fitted',
    shell_and_core: 'Shell & core',
  }
  return labels[condition] || condition
}

export default function BallparkResultCard({
  range,
  scopeIds,
  propertyType,
  location,
  sizeSqft,
  condition,
  onDigDeeper,
  onSaveLater,
  isLast,
  isStreaming,
}: Props) {
  const showActions = isLast && !isStreaming
  const scopeNames = scopeIds
    .map((id) => SCOPE_CATALOG.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s!.name)

  const propertyLabel = propertyType.charAt(0).toUpperCase() + propertyType.slice(1)
  const summaryParts = [propertyLabel, location, sizeSqft > 0 ? `${sizeSqft.toLocaleString()} sqft` : null, conditionLabel(condition)].filter(Boolean)

  return (
    <div className="w-full space-y-4 py-1">
      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
        <span className="text-[10px] tracking-[0.18em] uppercase text-[var(--ov-text-muted,#727272)] select-none whitespace-nowrap">
          quick estimate
        </span>
        <div className="flex-1 h-px bg-[var(--ov-border,rgba(255,255,255,0.07))]" />
      </div>

      {/* ── Property summary ── */}
      <p className="text-xs text-[var(--ov-text-muted,#727272)]">
        {summaryParts.join(' \u00B7 ')}
      </p>

      {/* ── Price range ── */}
      <div className="text-2xl font-semibold text-[var(--ov-text,#ffffff)] tracking-tight">
        {formatPriceRange(range)}
      </div>

      {/* ── Scope pills ── */}
      {scopeNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scopeNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#727272)]"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Caveat ── */}
      <p className="text-xs text-[var(--ov-text-muted,#727272)] leading-relaxed">
        This is a rough ballpark based on what you have shared so far. A detailed consultation can narrow this down significantly.
      </p>

      {/* ── CTAs ── */}
      {showActions && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDigDeeper}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer bg-brand-purple border border-brand-purple text-brand-dark hover:bg-brand-purple/90 font-medium"
          >
            <span className="leading-none text-base">🔍</span>
            Dig deeper
          </button>
          <button
            type="button"
            onClick={onSaveLater}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.50))] hover:text-[var(--ov-accent-strong,#7367ff)]"
          >
            <span className="leading-none text-base">🔖</span>
            Save &amp; continue
          </button>
        </div>
      )}
    </div>
  )
}
